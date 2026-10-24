package expo.modules.kanakku

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Telephony
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.work.*
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Only counters and the SMS cursor checkpoint live here; message contents never do. */
object HistoryImport {
  const val workName = "kanakku-sms-history"
  private const val notificationId = 43
  internal val guard = Any()
  internal fun prefs(c: Context) = c.getSharedPreferences("kanakku-import", Context.MODE_PRIVATE)
  internal fun active(c: Context, token: String) = prefs(c).let {
    it.getString("token", "") == token && it.getString("state", "") in setOf("queued", "running", "waiting")
  }
  private fun checkAccess(c: Context) {
    check(ContextCompat.checkSelfPermission(c, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED) { "SMS permission is required. Reconnect bank SMS in Settings." }
    check(Vault(c).ready()) { "Connect and unlock your vault first." }
  }
  fun start(c: Context, months: Int) = synchronized(guard) {
    checkAccess(c)
    check(prefs(c).getString("state", "idle") !in setOf("queued", "running", "waiting")) { "Pause the current import before choosing a new period." }
    val until = System.currentTimeMillis()
    val since = ImportWindow.since(months, until)
    val oldSince=prefs(c).getLong("coverageSince",-1)
    val oldUntil=prefs(c).getLong("coverageUntil",0)
    val token = UUID.randomUUID().toString()
    prefs(c).edit().clear().putString("token", token).putString("state", "queued")
      .putInt("months", months).putLong("since", since).putLong("until", until)
      .putLong("lastDate", until).putLong("lastId", Long.MAX_VALUE)
      .putLong("updated", until).putInt("total", -1).commit()
    prefs(c).edit().putLong("historyFloor",since).putLong("coverageSince",oldSince).putLong("coverageUntil",oldUntil).commit()
    enqueue(c, token)
    publish(c)
  }
  fun reconcile(c:Context)=synchronized(guard) {
    if(!Vault(c).enabled()||!Vault(c).ready()||ContextCompat.checkSelfPermission(c,Manifest.permission.READ_SMS)!=PackageManager.PERMISSION_GRANTED)return@synchronized
    val p=prefs(c)
    if(p.getString("state","idle") !in setOf("idle","complete"))return@synchronized
    val captureStart=c.getSharedPreferences("kanakku-settings",Context.MODE_PRIVATE).getLong("captureSince",System.currentTimeMillis())
    val checkpoint=p.getLong("lastReconciled",p.getLong("until",captureStart))
    val until=System.currentTimeMillis()
    if(until-checkpoint<60000)return@synchronized
    val floor=p.getLong("historyFloor",captureStart)
    val since=ImportWindow.backfillSince(floor,checkpoint)
    val token=UUID.randomUUID().toString()
    p.edit().putString("token",token).putString("state","queued").putBoolean("backfill",true)
      .putLong("since",since).putLong("until",until).putLong("lastDate",until).putLong("lastId",Long.MAX_VALUE)
      .putInt("scanned",0).putInt("captured",0).putInt("total",-1).remove("error").putLong("updated",until).commit()
    enqueue(c,token);publish(c)
  }
  private fun enqueue(c: Context, token: String) {
    val request = OneTimeWorkRequestBuilder<HistoryImportWorker>()
      .setInputData(workDataOf("token" to token))
      .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
      .setBackoffCriteria(BackoffPolicy.LINEAR, 10, TimeUnit.SECONDS).build()
    WorkManager.getInstance(c).enqueueUniqueWork(workName, ExistingWorkPolicy.REPLACE, request)
  }
  fun pause(c: Context) = synchronized(guard) {
    if (prefs(c).getString("state", "idle") in setOf("queued", "running", "waiting")) {
      prefs(c).edit().putString("state", "paused").commit()
      WorkManager.getInstance(c).cancelUniqueWork(workName)
      publish(c)
    }
  }
  fun resume(c: Context) = synchronized(guard) {
    checkAccess(c)
    check(prefs(c).getString("state", "idle") in setOf("paused", "error")) { "There is no paused import to resume." }
    val token = UUID.randomUUID().toString()
    prefs(c).edit().putString("token", token).putString("state", "queued").remove("error").putLong("updated", System.currentTimeMillis()).commit()
    enqueue(c, token)
    publish(c)
  }
  fun status(c: Context): Map<String, Any> = synchronized(guard) {
    val p = prefs(c)
    val stored = p.getString("state", "idle") ?: "idle"
    val state = if (stored == "running" && System.currentTimeMillis() - p.getLong("updated", 0) > 30000) "waiting" else stored
    val since = p.getLong("since", 0)
    val recent = maxOf(since, p.getLong("until", 0) - 7 * 86400000L)
    mapOf("state" to state, "months" to p.getInt("months", 1), "since" to since,
      "until" to p.getLong("until", 0), "scanned" to p.getInt("scanned", 0),
      "captured" to p.getInt("captured", 0), "total" to p.getInt("total", -1),
      "phase" to if (p.getLong("lastDate", Long.MAX_VALUE) >= recent) "recent" else "older",
      "pending" to if (Vault(c).ready()) Vault(c).pendingCount() else 0,
      "backfill" to p.getBoolean("backfill",false),"coverageSince" to p.getLong("coverageSince",if(stored=="complete"&&!p.getBoolean("backfill",false))since else -1),"coverageUntil" to p.getLong("coverageUntil",if(stored=="complete")p.getLong("until",0) else 0),
      "error" to (p.getString("error", "") ?: ""))
  }
  internal fun publish(c: Context) {
    KanakkuModule.notifyImport()
    val p = prefs(c)
    val state = p.getString("state", "idle") ?: "idle"
    if (state == "idle") return
    val manager = c.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel("history-import", "SMS history import", NotificationManager.IMPORTANCE_LOW).apply { description = "Progress while Kanakku reads past bank SMS on this device" })
    if (!manager.areNotificationsEnabled()) return
    val running = state in setOf("queued", "running", "waiting")
    val scanned = p.getInt("scanned", 0)
    val total = p.getInt("total", -1)
    val percent = if (total > 0) (scanned * 100L / total).coerceAtMost(99).toInt() else 0
    val open = PendingIntent.getActivity(c, 43, Intent(Intent.ACTION_VIEW, Uri.parse("kanakku:///"))
      .setPackage(c.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val publicVersion = NotificationCompat.Builder(c, "history-import").setSmallIcon(R.drawable.ic_stat_kanakku).setColor(Prompts.BRAND)
      .setContentTitle("Kanakku history import").setContentText(if (running) "Processing on this device" else "Open Kanakku for status").build()
    val label = when (state) { "complete" -> "History scan complete"; "paused" -> "History import paused"; "error" -> "History import needs attention"; "waiting", "queued" -> "Waiting to import history"; else -> "Importing SMS history · $percent%" }
    val n = NotificationCompat.Builder(c, "history-import").setSmallIcon(R.drawable.ic_stat_kanakku).setColor(Prompts.BRAND)
      .setContentTitle(label).setContentText(if (total < 0) "Preparing your selected history" else "$scanned messages checked · ${p.getInt("captured", 0)} alerts found")
      .setContentIntent(open).setOnlyAlertOnce(true).setOngoing(running).setAutoCancel(!running)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setPublicVersion(publicVersion)
    if (running) {
      n.setProgress(if (total > 0) total else 100, scanned, total < 0)
      val pause = PendingIntent.getBroadcast(c, 44, Intent(c, ImportActionReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      n.addAction(R.drawable.ic_kanakku_pause, "Pause", pause)
    }
    try { manager.notify(notificationId, n.build()) } catch (_: SecurityException) { /* Permission denial leaves in-app progress available. */ }
  }
}

class ImportActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) { HistoryImport.pause(context) }
}

class HistoryImportWorker(c: Context, params: WorkerParameters) : Worker(c, params) {
  override fun doWork(): Result {
    val c = applicationContext
    Diagnostics.install(c)
    val token = inputData.getString("token") ?: return Result.failure()
    val p = HistoryImport.prefs(c)
    val started = System.currentTimeMillis()
    val vault = Vault(c)
    // Diagnostics only: alerts recognised per bank/kind in this run (no amounts or text).
    val recognised = sortedMapOf<String, Int>()
    try {
      synchronized(HistoryImport.guard) {
        if (!HistoryImport.active(c, token)) return Result.success()
        p.edit().putString("state", "running").putLong("updated", started).commit()
      }
      val since = p.getLong("since", 0).toString()
      val until = p.getLong("until", 0).toString()
      if (p.getInt("total", -1) < 0) {
        val total = c.contentResolver.query(Telephony.Sms.Inbox.CONTENT_URI, arrayOf("_id"), "date >= ? AND date <= ?", arrayOf(since, until), null)?.use { it.count }
          ?: throw IllegalStateException("SMS inbox unavailable")
        synchronized(HistoryImport.guard) {
          if (!HistoryImport.active(c, token)) return Result.success()
          p.edit().putInt("total", total).commit()
        }
        HistoryImport.publish(c)
      }
      while (!isStopped && HistoryImport.active(c, token)) {
        val lastDate = p.getLong("lastDate", Long.MAX_VALUE).toString()
        val lastId = p.getLong("lastId", Long.MAX_VALUE).toString()
        var count = 0
        val cursor = c.contentResolver.query(Telephony.Sms.Inbox.CONTENT_URI, arrayOf("_id", "date", "address", "body"),
          "date >= ? AND date <= ? AND (date < ? OR (date = ? AND _id < ?))", arrayOf(since, until, lastDate, lastDate, lastId), "date DESC, _id DESC")
          ?: throw IllegalStateException("SMS inbox unavailable")
        cursor.use {
          while (count < 100 && !isStopped && it.moveToNext()) {
            synchronized(HistoryImport.guard) {
              if (!HistoryImport.active(c, token)) return Result.success()
              check(it.getLong(1) >= p.getLong("since", 0) && it.getLong(1) <= p.getLong("until", 0) &&
                ImportWindow.afterCheckpoint(it.getLong(1), it.getLong(0), p.getLong("lastDate", Long.MAX_VALUE), p.getLong("lastId", Long.MAX_VALUE))) { "Invalid import cursor" }
              val t = SmsParser.parse(it.getString(2) ?: "", it.getString(3) ?: "", it.getLong(1))
              if (t != null) recognised["${t.bank}/${t.kind}"] = (recognised["${t.bank}/${t.kind}"] ?: 0) + 1
              else SmsParser.statement(it.getString(2) ?: "", it.getString(3) ?: "", it.getLong(1))?.let { s -> vault.captureStatement(s) }
                ?: UnreadAlerts.record(c, it.getString(2) ?: "", it.getString(3) ?: "", it.getLong(1))
              val added = if (t != null && vault.capture(SemanticClassifier.enrich(c, t))) 1 else 0
              // Capture before checkpoint. A crash between them replays safely using the ingestion ID.
              p.edit().putLong("lastDate", it.getLong(1)).putLong("lastId", it.getLong(0))
                .putInt("scanned", p.getInt("scanned", 0) + 1).putInt("captured", p.getInt("captured", 0) + added)
                .putLong("updated", System.currentTimeMillis()).commit()
            }
            count++
            if (count % 25 == 0) { HistoryImport.publish(c); KanakkuModule.notifyArrival() }
          }
        }
        synchronized(HistoryImport.guard) {
          if (!HistoryImport.active(c, token) || isStopped) return Result.success()
          if (count == 0) {
            val sinceValue=p.getLong("since",0);val untilValue=p.getLong("until",0)
            val covered=ImportWindow.coverageSince(p.getLong("coverageSince",-1),p.getLong("coverageUntil",0),sinceValue)
            p.edit().putString("state", "complete").putInt("total", p.getInt("scanned", 0)).putLong("lastReconciled",untilValue).putLong("coverageSince",covered).putLong("coverageUntil",untilValue).commit()
            Diagnostics.log("info", "import", "complete", mapOf("months" to p.getInt("months", 0), "backfill" to p.getBoolean("backfill", false),
              "scanned" to p.getInt("scanned", 0), "captured" to p.getInt("captured", 0), "lastRunMs" to System.currentTimeMillis() - started,
              "lastRunRecognised" to recognised.entries.joinToString(",") { "${it.key}=${it.value}" }))
            HistoryImport.publish(c); KanakkuModule.notifyArrival()
            return Result.success()
          }
          HistoryImport.publish(c); KanakkuModule.notifyArrival()
          // Yield before WorkManager's execution limit, retaining the cursor for the next run.
          if (System.currentTimeMillis() - started > 8 * 60000L) {
            p.edit().putString("state", "waiting").commit(); HistoryImport.publish(c)
            return Result.retry()
          }
        }
      }
      return Result.success()
    } catch (e: Exception) {
      Diagnostics.log("error", "import", "worker-failed", mapOf("scanned" to p.getInt("scanned", 0), "captured" to p.getInt("captured", 0)), e)
      synchronized(HistoryImport.guard) {
        if (HistoryImport.active(c, token)) {
          p.edit().putString("state", "error").putString("error", if (e is SecurityException) "SMS permission was removed. Reconnect in Settings, then resume." else "Import was interrupted. Resume to retry from your saved progress.").commit()
          HistoryImport.publish(c)
        }
      }
      return Result.failure()
    }
  }
  override fun onStopped() {
    synchronized(HistoryImport.guard) {
      val token = inputData.getString("token") ?: return
      if (HistoryImport.active(applicationContext, token)) {
        HistoryImport.prefs(applicationContext).edit().putString("state", "waiting").commit()
        HistoryImport.publish(applicationContext)
      }
    }
  }
}
