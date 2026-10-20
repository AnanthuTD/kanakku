package expo.modules.kanakku

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.util.Base64
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import expo.modules.kotlin.Promise
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.URLEncoder
import java.security.SecureRandom
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

internal object BackupCrypto {
  private const val iterations = 600_000
  private const val aad = "kanakku-drive-backup-v1"
  private const val maxPlainBytes = 24 * 1024 * 1024
  private fun key(password: CharArray, salt: ByteArray): ByteArray {
    val spec = PBEKeySpec(password, salt, iterations, 256)
    return try {
      SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
    } finally { spec.clearPassword() }
  }
  fun encrypt(plain: String, password: String): String {
    require(password.length >= 12) { "Use a backup password with at least 12 characters." }
    val bytes = plain.toByteArray(Charsets.UTF_8)
    require(bytes.size <= maxPlainBytes) { "This backup is too large (maximum 24 MiB before encryption)." }
    val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
    val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key(password.toCharArray(), salt), "AES"), GCMParameterSpec(128, iv))
    cipher.updateAAD(aad.toByteArray(Charsets.UTF_8))
    val encrypted = cipher.doFinal(bytes)
    return JSONObject().put("format", "kanakku-drive-backup").put("version", 1)
      .put("kdf", "PBKDF2-HMAC-SHA256").put("iterations", iterations)
      .put("salt", Base64.encodeToString(salt, Base64.NO_WRAP))
      .put("iv", Base64.encodeToString(iv, Base64.NO_WRAP))
      .put("ciphertext", Base64.encodeToString(encrypted, Base64.NO_WRAP)).toString()
  }
  fun decrypt(blob: String, password: String): String {
    require(password.length >= 12) { "Enter the backup password (at least 12 characters)." }
    require(blob.length <= 36 * 1024 * 1024) { "This backup file is too large." }
    val envelope = JSONObject(blob)
    require(envelope.optString("format") == "kanakku-drive-backup" && envelope.optInt("version") == 1) { "This is not a supported Kanakku backup." }
    require(envelope.optString("kdf") == "PBKDF2-HMAC-SHA256" && envelope.optInt("iterations") == iterations) { "This backup uses an unsupported encryption format." }
    val salt = Base64.decode(envelope.getString("salt"), Base64.DEFAULT)
    val iv = Base64.decode(envelope.getString("iv"), Base64.DEFAULT)
    require(salt.size == 16 && iv.size == 12) { "This backup is damaged." }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key(password.toCharArray(), salt), "AES"), GCMParameterSpec(128, iv))
    cipher.updateAAD(aad.toByteArray(Charsets.UTF_8))
    return try { String(cipher.doFinal(Base64.decode(envelope.getString("ciphertext"), Base64.DEFAULT)), Charsets.UTF_8) }
    catch (_: Exception) { throw IllegalArgumentException("Could not unlock this backup. Check the password or choose another backup.") }
  }
}

/** One visible, app-owned Drive file. Uploads are user initiated; no backup password or journal payload is logged. */
internal object DriveBackupApi {
  const val SCOPE = "https://www.googleapis.com/auth/drive.file"
  private const val fileName = "Kanakku encrypted backup.kbk"
  private const val mime = "application/vnd.kanakku.backup+json"
  private const val maxResponse = 36 * 1024 * 1024
  private val client = OkHttpClient.Builder()
    .followRedirects(false)
    .followSslRedirects(false)
    .connectTimeout(20, TimeUnit.SECONDS)
    .readTimeout(40, TimeUnit.SECONDS)
    .build()

  private fun request(token: String, path: String, method: String = "GET", body: ByteArray? = null, contentType: String? = null): ByteArray {
    val url = if (path.startsWith("https://")) path else "https://www.googleapis.com/drive/v3/$path"
    val requestBody = body?.toRequestBody((contentType ?: "application/json").toMediaType())
    val request = Request.Builder().url(url)
      .header("Authorization", "Bearer $token")
      .header("Accept", "application/json")
      .method(method, requestBody)
      .build()
    client.newCall(request).execute().use { response ->
      if (!response.isSuccessful) {
        val detail = response.body?.byteStream()?.use { stream ->
          val bytes = ByteArray(2048); val count = stream.read(bytes)
          if (count > 0) String(bytes, 0, count, Charsets.UTF_8) else ""
        }.orEmpty()
        throw IllegalStateException(when (response.code) {
          401, 403 -> "Google Drive access was denied. Check Drive is enabled for the Kanakku Google project, then reconnect."
          404 -> "No Kanakku backup was found in this Google account."
          else -> "Google Drive could not complete the request (HTTP ${response.code}). ${detail.take(160)}"
        })
      }
      val stream = response.body?.byteStream() ?: return ByteArray(0)
      return stream.use { input ->
        val bytes = ByteArrayOutputStream()
        val buffer = ByteArray(16_384)
        while (true) {
          val count = input.read(buffer)
          if (count < 0) break
          require(bytes.size() + count <= maxResponse) { "The Drive backup is too large to restore on this device." }
          bytes.write(buffer, 0, count)
        }
        bytes.toByteArray()
      }
    }
  }
  private fun find(token: String): String? {
    val query = "name='$fileName' and trashed=false"
    val path = "files?q=${URLEncoder.encode(query, "UTF-8")}&spaces=drive&pageSize=1&orderBy=modifiedTime%20desc&fields=files(id,name,modifiedTime,size)"
    val files = JSONObject(request(token, path).toString(Charsets.UTF_8)).optJSONArray("files")
    return files?.optJSONObject(0)?.optString("id")?.takeIf { it.isNotBlank() }
  }
  fun upload(token: String, encrypted: String): Map<String, Any> {
    val bytes = encrypted.toByteArray(Charsets.UTF_8)
    require(bytes.size <= maxResponse) { "This encrypted backup is too large for this device." }
    val existing = find(token)
    val result = if (existing != null) {
      JSONObject(request(token, "https://www.googleapis.com/upload/drive/v3/files/$existing?uploadType=media", "PATCH", bytes, mime).toString(Charsets.UTF_8))
    } else {
      val boundary = "kanakku-${System.nanoTime()}"
      val metadata = JSONObject().put("name", fileName).put("mimeType", mime)
      val head = "--$boundary\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n$metadata\r\n--$boundary\r\nContent-Type: $mime\r\n\r\n".toByteArray(Charsets.UTF_8)
      val tail = "\r\n--$boundary--".toByteArray(Charsets.UTF_8)
      val payload = ByteArray(head.size + bytes.size + tail.size).also { head.copyInto(it);bytes.copyInto(it, head.size);tail.copyInto(it, head.size + bytes.size) }
      JSONObject(request(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime", "POST", payload, "multipart/related; boundary=$boundary").toString(Charsets.UTF_8))
    }
    return mapOf("fileName" to result.optString("name", fileName), "modifiedTime" to result.optString("modifiedTime", ""))
  }
  fun download(token: String): String {
    val id = find(token) ?: throw IllegalStateException("No Kanakku backup was found in this Google account.")
    val encoded = URLEncoder.encode(id, "UTF-8")
    return String(request(token, "https://www.googleapis.com/drive/v3/files/$encoded?alt=media"), Charsets.UTF_8)
  }
}

/** Additional Drive authorization is requested only when the user starts backup or restore. */
internal object DriveBackupAuthorization {
  const val REQUEST = 42314
  private data class Pending(val context: Context, val operation: String, val payload: String?, val password: String, val promise: Promise)
  @Volatile private var pending: Pending? = null
  private val worker = Executors.newSingleThreadExecutor()
  fun begin(activity: Activity, context: Context, operation: String, payload: String?, password: String, promise: Promise) {
    if (pending != null) { promise.reject("DRIVE_BUSY", "Finish the current Google Drive action first.", null); return }
    if (operation !in setOf("backup", "restore")) { promise.reject("DRIVE_ACTION", "Unknown backup action.", null); return }
    if (password.length < 12) { promise.reject("DRIVE_PASSWORD", "Use a backup password with at least 12 characters.", null); return }
    val attempt = Pending(context.applicationContext, operation, payload, password, promise)
    pending = attempt
    val request = AuthorizationRequest.builder().setRequestedScopes(listOf(Scope(DriveBackupApi.SCOPE)))
      .setOptOutIncludingGrantedScopes(true).setPrompt(AuthorizationRequest.Prompt.SELECT_ACCOUNT).build()
    Identity.getAuthorizationClient(activity).authorize(request).addOnSuccessListener { result ->
      if (pending !== attempt) return@addOnSuccessListener
      try {
        if (result.hasResolution()) activity.startIntentSenderForResult(requireNotNull(result.pendingIntent).intentSender, REQUEST, null, 0, 0, 0)
        else finish(attempt, result)
      } catch (_: Exception) { fail(attempt, "Google Drive authorization could not start. Try again.") }
    }.addOnFailureListener { fail(attempt, "Google Drive authorization failed. Check your connection and try again.") }
  }
  fun result(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST) return
    val attempt = pending ?: return
    if (resultCode != Activity.RESULT_OK || data == null) {
      val code = runCatching { Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(data).accessToken; null }
        .getOrElse { (it as? ApiException)?.statusCode }
      fail(attempt, "Google Drive access was cancelled${code?.let { " (Google status $it)" }.orEmpty()}. No backup was changed.")
      return
    }
    try { finish(attempt, Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(data)) }
    catch (_: Exception) { fail(attempt, "Google Drive authorization did not finish. Try again.") }
  }
  private fun finish(attempt: Pending, result: AuthorizationResult) {
    val token = result.accessToken
    if (result.hasResolution() || token.isNullOrBlank() || DriveBackupApi.SCOPE !in result.grantedScopes) {
      fail(attempt, "Google Drive permission was not granted. Your local journal is unchanged."); return
    }
    worker.execute {
      try {
        val value = if (attempt.operation == "backup") {
          DriveBackupApi.upload(token, BackupCrypto.encrypt(requireNotNull(attempt.payload), attempt.password))
        } else {
          BackupCrypto.decrypt(DriveBackupApi.download(token), attempt.password)
        }
        attempt.promise.resolve(value)
        pending = null
      } catch (error: Exception) {
        attempt.promise.reject("DRIVE_BACKUP", error.message ?: "Google Drive backup failed.", null)
        pending = null
      }
    }
  }
  private fun fail(attempt: Pending, message: String) {
    if (pending !== attempt) return
    pending = null
    attempt.promise.reject("DRIVE_AUTH", message, null)
  }
}
