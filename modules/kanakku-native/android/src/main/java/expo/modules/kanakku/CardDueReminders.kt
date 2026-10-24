package expo.modules.kanakku

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.util.concurrent.TimeUnit

/**
 * A private nudge three days before a card bill is due. The notification never shows the bank,
 * card or amount, so it is safe on a lock screen. Off when the user turns card reminders off.
 */
object CardDueReminders {
  private const val channel = "card-due-reminders"
  private val india = ZoneId.of("Asia/Kolkata")
  private fun work(id: String) = "kanakku-card-due-$id"
  private fun prefs(c: Context) = c.getSharedPreferences("kanakku-settings", Context.MODE_PRIVATE)

  fun enabled(c: Context) = prefs(c).getBoolean("cardDueReminders", true)
  fun setEnabled(c: Context, value: Boolean) {
    prefs(c).edit().putBoolean("cardDueReminders", value).apply()
    if (!value) WorkManager.getInstance(c).cancelAllWorkByTag(channel)
  }

  /** When to remind: 10:00 IST three days before the due date, or soon if that has passed. */
  fun remindAt(dueDate: String, now: Long): Long? {
    val due = runCatching { LocalDate.parse(dueDate) }.getOrNull() ?: return null
    val dueEnd = due.atTime(LocalTime.of(23, 59)).atZone(india).toInstant().toEpochMilli()
    if (dueEnd <= now) return null
    val planned = due.minusDays(3).atTime(LocalTime.of(10, 0)).atZone(india).toInstant().toEpochMilli()
    return maxOf(planned, now + 15 * 60_000L)
  }

  fun schedule(c: Context, s: CardStatement) {
    if (!enabled(c) || s.totalDue <= 0) return
    if (!s.id.matches(Regex("[A-Za-z0-9]{1,100}"))) return
    val at = remindAt(s.dueDate, System.currentTimeMillis()) ?: return
    val request = OneTimeWorkRequestBuilder<CardDueReminderWorker>()
      .setInputData(Data.Builder().putString("id", s.id).build())
      .setInitialDelay(at - System.currentTimeMillis(), TimeUnit.MILLISECONDS)
      .addTag(channel)
      .build()
    WorkManager.getInstance(c).enqueueUniqueWork(work(s.id), ExistingWorkPolicy.KEEP, request)
  }

  fun cancel(c: Context, id: String) {
    if (id.matches(Regex("[A-Za-z0-9]{1,100}"))) WorkManager.getInstance(c).cancelUniqueWork(work(id))
  }

  fun show(c: Context, id: String) {
    if (!enabled(c)) return
    if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    val manager = c.getSystemService(android.app.NotificationManager::class.java)
    manager.createNotificationChannel(android.app.NotificationChannel(channel, "Card bill reminders", android.app.NotificationManager.IMPORTANCE_DEFAULT).apply { description = "A reminder before a credit card bill read from your SMS is due" })
    val intent = c.packageManager.getLaunchIntentForPackage(c.packageName)?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val pending = intent?.let { PendingIntent.getActivity(c, id.hashCode(), it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) }
    val notification = NotificationCompat.Builder(c, channel)
      .setSmallIcon(R.drawable.ic_stat_kanakku)
      .setContentTitle("A card bill is due soon")
      .setContentText("Open Kanakku to see the amount and date.")
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setAutoCancel(true)
      .setContentIntent(pending)
      .build()
    runCatching { NotificationManagerCompat.from(c).notify(9000 + (id.hashCode() and 0x7fff), notification) }
    Diagnostics.log("info", "card-due", "reminded", emptyMap())
  }
}

class CardDueReminderWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val id = inputData.getString("id") ?: return Result.success()
    CardDueReminders.show(applicationContext, id)
    return Result.success()
  }
}
