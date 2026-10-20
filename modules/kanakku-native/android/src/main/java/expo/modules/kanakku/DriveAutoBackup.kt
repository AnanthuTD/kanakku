package expo.modules.kanakku

import android.accounts.Account
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.util.Base64
import androidx.work.*
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import com.google.android.gms.tasks.Tasks
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** User-opted-in schedule and an encrypted, last-unlocked journal snapshot.
 * The archive passphrase and snapshot are wrapped by a non-exportable Android Keystore key.
 */
internal object DriveAutoBackupStore {
  private const val alias = "kanakku-drive-auto-backup-v1"
  private const val fileName = "drive-auto-backup.enc"
  private const val workName = "kanakku-drive-auto-backup"
  private const val nowWorkName = "kanakku-drive-auto-backup-now"
  private val lock = Any()
  private fun file(c: Context) = File(c.noBackupFilesDir, fileName)
  private fun key(create: Boolean): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(alias, null) as? SecretKey)?.let { return it }
    check(create) { "Automatic backup needs to be set up again on this device." }
    return KeyGenerator.getInstance("AES", "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true).build())
    }.generateKey()
  }
  private fun read(c: Context): JSONObject = synchronized(lock) {
    val f = file(c)
    if (!f.exists()) return JSONObject()
    val envelope = JSONObject(f.readText(Charsets.UTF_8))
    val iv = Base64.decode(envelope.getString("iv"), Base64.NO_WRAP)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
      init(Cipher.DECRYPT_MODE, key(false), GCMParameterSpec(128, iv))
      updateAAD("kanakku-auto-backup-state-v1".toByteArray())
    }
    JSONObject(String(cipher.doFinal(Base64.decode(envelope.getString("data"), Base64.NO_WRAP)), Charsets.UTF_8))
  }
  private fun write(c: Context, value: JSONObject) = synchronized(lock) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
      init(Cipher.ENCRYPT_MODE, key(true)); updateAAD("kanakku-auto-backup-state-v1".toByteArray())
    }
    val envelope = JSONObject().put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
      .put("data", Base64.encodeToString(cipher.doFinal(value.toString().toByteArray()), Base64.NO_WRAP))
    val atomic = AtomicFile(file(c))
    val out = atomic.startWrite()
    try { out.write(envelope.toString().toByteArray(Charsets.UTF_8)); atomic.finishWrite(out) }
    catch (error: Exception) { atomic.failWrite(out); throw error }
  }
  fun saveSnapshot(c: Context, payload: String) {
    require(payload.length <= 24 * 1024 * 1024) { "This journal is too large for automatic backup." }
    val state = read(c)
    if (!state.optBoolean("enabled", false)) return
    state.put("snapshot", payload).put("snapshotAt", System.currentTimeMillis())
    write(c, state)
  }
  fun enable(c: Context, payload: String, password: String, account: String, intervalDays: Int) {
    require(password.length >= 12 && account.contains("@") && intervalDays in setOf(1, 7, 30))
    val state = JSONObject().put("enabled", true).put("password", password).put("account", account)
      .put("intervalDays", intervalDays).put("lastBackupAt", System.currentTimeMillis()).put("snapshot", payload)
      .put("snapshotAt", System.currentTimeMillis()).put("state", "connected")
    write(c, state)
    schedule(c, intervalDays)
  }
  fun disable(c: Context) {
    WorkManager.getInstance(c).cancelUniqueWork(workName)
    WorkManager.getInstance(c).cancelUniqueWork(nowWorkName)
    synchronized(lock) {
      val f = file(c); if (f.exists()) f.delete()
      KeyStore.getInstance("AndroidKeyStore").apply { load(null); if (containsAlias(alias)) deleteEntry(alias) }
    }
  }
  fun runNow(c: Context, payload: String) {
    saveSnapshot(c, payload)
    val state = read(c)
    check(state.optBoolean("enabled", false)) { "Turn on automatic backup first." }
    write(c, state.put("state", "waiting").put("error", ""))
    val request = OneTimeWorkRequestBuilder<DriveAutoBackupWorker>()
      .setInputData(workDataOf("force" to true))
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).setRequiresBatteryNotLow(true).build())
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.MINUTES).build()
    WorkManager.getInstance(c).enqueueUniqueWork(nowWorkName, ExistingWorkPolicy.KEEP, request)
  }
  fun setInterval(c: Context, days: Int) {
    require(days in setOf(1, 7, 30))
    val state = read(c)
    check(state.optBoolean("enabled", false)) { "Turn on automatic backup first." }
    write(c, state.put("intervalDays", days))
    schedule(c, days)
  }
  fun status(c: Context): Map<String, Any> {
    val s = read(c)
    return mapOf("enabled" to s.optBoolean("enabled", false), "intervalDays" to s.optInt("intervalDays", 7),
      "lastBackupAt" to s.optLong("lastBackupAt", 0), "snapshotAt" to s.optLong("snapshotAt", 0),
      "state" to s.optString("state", "off"), "error" to s.optString("error", ""))
  }
  private fun schedule(c: Context, days: Int) {
    val request = PeriodicWorkRequestBuilder<DriveAutoBackupWorker>(days.toLong(), TimeUnit.DAYS)
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).setRequiresBatteryNotLow(true).build())
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.MINUTES).build()
    WorkManager.getInstance(c).enqueueUniquePeriodicWork(workName, ExistingPeriodicWorkPolicy.UPDATE, request)
  }
  fun perform(c: Context, alive: () -> Boolean, force: Boolean): ListenableWorker.Result {
    if (!c.getSystemService(android.os.UserManager::class.java).isUserUnlocked) return ListenableWorker.Result.retry()
    val state = try { read(c) } catch (_: Exception) { return ListenableWorker.Result.failure() }
    if (!state.optBoolean("enabled", false)) return ListenableWorker.Result.success()
    val now = System.currentTimeMillis()
    if (!force && now - state.optLong("lastBackupAt", 0) < state.optInt("intervalDays", 7) * 86_400_000L) return ListenableWorker.Result.success()
    if (!state.has("snapshot") || state.optString("password").length < 12) return ListenableWorker.Result.retry()
    synchronized(lock) {
      val latest = read(c)
      if (latest.optBoolean("enabled", false)) write(c, latest.put("state", "uploading").put("error", ""))
    }
    return try {
      val account = state.getString("account")
      val request = AuthorizationRequest.builder().setAccount(Account(account, "com.google"))
        .setRequestedScopes(listOf(Scope(DriveBackupApi.SCOPE))).setOptOutIncludingGrantedScopes(true).build()
      val auth = Tasks.await(Identity.getAuthorizationClient(c).authorize(request), 45, TimeUnit.SECONDS)
      if (!alive()) {
        synchronized(lock) {
          val latest = read(c)
          if (latest.optBoolean("enabled", false)) write(c, latest.put("state", "waiting"))
        }
        return ListenableWorker.Result.retry()
      }
      if (auth.hasResolution() || auth.accessToken.isNullOrBlank() || DriveBackupApi.SCOPE !in auth.grantedScopes) {
        synchronized(lock) {
          val latest = read(c)
          if (latest.optBoolean("enabled", false)) write(c, latest.put("state", "reconnect").put("error", "Open Kanakku to reconnect Google Drive."))
        }
        return ListenableWorker.Result.failure()
      }
      val current = read(c)
      if (!current.optBoolean("enabled", false)) return ListenableWorker.Result.success()
      val encrypted = BackupCrypto.encrypt(current.getString("snapshot"), current.getString("password"))
      DriveBackupApi.upload(auth.accessToken!!, encrypted) { transferred, total ->
        KanakkuModule.notifyBackupProgress("backup", "uploading", transferred, total)
      }
      if (!alive()) {
        synchronized(lock) {
          val latest = read(c)
          if (latest.optBoolean("enabled", false)) write(c, latest.put("state", "waiting"))
        }
        return ListenableWorker.Result.retry()
      }
      synchronized(lock) {
        val latest = read(c)
        if (!latest.optBoolean("enabled", false)) return ListenableWorker.Result.success()
        write(c, latest.put("lastBackupAt", System.currentTimeMillis()).put("state", "connected").put("error", ""))
      }
      ListenableWorker.Result.success()
    } catch (error: Exception) {
      runCatching {
        synchronized(lock) {
          val latest = read(c)
          if (latest.optBoolean("enabled", false)) write(c, latest.put("state", "error").put("error", "Automatic backup could not finish. Open Kanakku to retry."))
        }
      }
      ListenableWorker.Result.retry()
    }
  }
}

internal class DriveAutoBackupWorker(c: Context, p: WorkerParameters) : Worker(c, p) {
  override fun doWork(): Result = DriveAutoBackupStore.perform(applicationContext, { !isStopped }, inputData.getBoolean("force", false))
}
