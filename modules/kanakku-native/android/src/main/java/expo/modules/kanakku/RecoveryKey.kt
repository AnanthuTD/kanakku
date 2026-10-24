package expo.modules.kanakku

import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * An optional, user-held second lock on the journal key, stored only on the phone. If Android
 * deletes the screen-lock-bound key (for example when the screen lock is removed), the password
 * opens the journal again. PBKDF2-HMAC-SHA256 (600k) + AES-256-GCM, bound to its own label so a
 * Drive backup and a recovery envelope can never be confused.
 */
object RecoveryKey {
  private const val iterations = 600_000
  private const val aad = "kanakku-recovery-key-v1"
  const val MIN_PASSWORD = 12
  private const val FORMAT = "kanakku-recovery-key"

  private fun derive(password: String, salt: ByteArray): ByteArray {
    val spec = PBEKeySpec(password.toCharArray(), salt, iterations, 256)
    return try { SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded } finally { spec.clearPassword() }
  }

  fun wrap(secret: String, password: String): String {
    require(password.length >= MIN_PASSWORD) { "Use a recovery password with at least $MIN_PASSWORD characters." }
    val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
    val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(derive(password, salt), "AES"), GCMParameterSpec(128, iv))
    cipher.updateAAD(aad.toByteArray())
    val b64 = Base64.getEncoder()
    // format:version:iterations:salt:iv:ciphertext (Base64 never contains ':').
    return listOf(FORMAT, "1", iterations.toString(), b64.encodeToString(salt), b64.encodeToString(iv),
      b64.encodeToString(cipher.doFinal(secret.toByteArray()))).joinToString(":")
  }

  fun unwrap(blob: String, password: String): String {
    val parts = blob.trim().split(":")
    require(parts.size == 6 && parts[0] == FORMAT && parts[1] == "1" && parts[2] == iterations.toString()) { "This recovery key uses an unsupported format." }
    val b64 = Base64.getDecoder()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(derive(password, b64.decode(parts[3])), "AES"), GCMParameterSpec(128, b64.decode(parts[4])))
    cipher.updateAAD(aad.toByteArray())
    return try { String(cipher.doFinal(b64.decode(parts[5]))) }
    catch (_: Exception) { throw IllegalArgumentException("That recovery password doesn't match.") }
  }
}
