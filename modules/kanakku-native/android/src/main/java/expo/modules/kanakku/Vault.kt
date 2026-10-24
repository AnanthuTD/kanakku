package expo.modules.kanakku

import android.app.KeyguardManager
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.AtomicFile
import android.database.sqlite.SQLiteDatabase
import org.json.JSONObject
import java.io.File
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.KeyFactory
import android.security.keystore.KeyInfo
import java.security.SecureRandom
import java.security.spec.MGF1ParameterSpec
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.OAEPParameterSpec
import javax.crypto.spec.PSource
import javax.crypto.spec.SecretKeySpec

class Vault(private val context: Context) {
  private val alias = "kanakku-sealed-inbox-v1"
  // "open" mode: a hardware-backed key that needs no fingerprint/PIN, so it survives screen-lock changes.
  private val openAlias = "kanakku-sealed-inbox-open-v1"
  private val store get() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
  private val prefs get() = context.getSharedPreferences("kanakku-settings", Context.MODE_PRIVATE)
  private val initialEpoch=prefs.getLong("vaultEpoch",0)
  /** "device": the phone's lock (biometric, PIN, pattern) is needed to open the journal. "open": no prompt. */
  fun lockMode() = if (prefs.getString("lockMode", "device") == "open") "open" else "device"
  private fun activeAlias() = if (lockMode() == "open") openAlias else alias
  private val envelopeFile get() = File(context.noBackupFilesDir, "ledger-key.envelope")
  private val recoveryFile get() = AtomicFile(File(context.noBackupFilesDir, "ledger-key.recovery"))
  fun ready() = store.containsAlias(activeAlias())
  /** Before the first connection only: choose how the journal will open. */
  fun chooseInitialLockMode(mode: String) {
    require(mode == "device" || mode == "open")
    check(!envelopeFile.exists()) { "Change this in Settings › Privacy & device." }
    prefs.edit().putString("lockMode", mode).commit()
  }
  private fun generate(keyAlias: String, authBound: Boolean) {
    KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_RSA, "AndroidKeyStore").apply {
      val spec = KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_DECRYPT).setKeySize(2048)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_RSA_OAEP).setDigests(KeyProperties.DIGEST_SHA256, KeyProperties.DIGEST_SHA1)
      if (authBound) spec.setUserAuthenticationRequired(true).setUserAuthenticationParameters(60, KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL)
      initialize(spec.build())
    }.generateKeyPair()
  }
  fun initialize() {
    if (lockMode() == "device") check(context.getSystemService(KeyguardManager::class.java).isDeviceSecure) { "Set a device PIN or biometric before connecting SMS." }
    // Android deletes authentication-bound keys when the screen lock is removed. A journal envelope
    // without its key means the old journal can no longer be opened; remember that, so unlock can
    // explain it instead of showing a generic failure. The envelope itself is never replaced here.
    if (!ready() && File(context.noBackupFilesDir, "ledger-key.envelope").exists()) prefs.edit().putBoolean("keyRetired", true).commit()
    if (!ready()) generate(activeAlias(), authBound = lockMode() == "device")
  }
  private fun b64(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.NO_WRAP)
  private fun decode(s: String) = Base64.decode(s, Base64.NO_WRAP)
  private fun rsa(mode: Int, keyAlias: String) = Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding").apply {
    val key = if (mode == Cipher.ENCRYPT_MODE) store.getCertificate(keyAlias).publicKey else store.getKey(keyAlias, null)
    init(mode, key, OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT))
  }
  // Each envelope names the key that sealed it, so a lock-mode switch interrupted half-way stays readable.
  private fun seal(bytes: ByteArray, keyAlias: String = activeAlias()): String {
    val key = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key) }
    return JSONObject().put("key", b64(rsa(Cipher.ENCRYPT_MODE, keyAlias).doFinal(key.encoded))).put("iv", b64(cipher.iv)).put("data", b64(cipher.doFinal(bytes))).put("alias", keyAlias).toString()
  }
  private fun sealedBy(text: String) = JSONObject(text).optString("alias", alias)
  private fun unseal(text: String): ByteArray {
    val j = JSONObject(text)
    val key = SecretKeySpec(rsa(Cipher.DECRYPT_MODE, j.optString("alias", alias)).doFinal(decode(j.getString("key"))), "AES")
    return Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, decode(j.getString("iv")))) }.doFinal(decode(j.getString("data")))
  }
  fun databaseKey(): String {
    val file = AtomicFile(File(context.noBackupFilesDir, "ledger-key.envelope"))
    if (!file.baseFile.exists()) {
      val key = ByteArray(32).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
      val out = file.startWrite()
      try { out.write(seal(key.toByteArray()).toByteArray()); file.finishWrite(out) } catch (e: Exception) { file.failWrite(out); throw e }
    }
    return String(unseal(String(file.readFully())))
  }
  private fun inbox(): SQLiteDatabase = synchronized(inboxGuard) { SQLiteDatabase.openOrCreateDatabase(File(context.noBackupFilesDir, "sealed-inbox.db"), null).apply {
    execSQL("CREATE TABLE IF NOT EXISTS inbox (id TEXT PRIMARY KEY, envelope TEXT NOT NULL, review INTEGER NOT NULL DEFAULT 1)")
    val columns=rawQuery("PRAGMA table_info(inbox)",null).use { c -> buildList {while(c.moveToNext())add(c.getString(1))} }
    if("review" !in columns) execSQL("ALTER TABLE inbox ADD COLUMN review INTEGER NOT NULL DEFAULT 1")
    // Answers given to the floating companion; sealed with the public key so no unlock is needed.
    execSQL("CREATE TABLE IF NOT EXISTS answers (id TEXT PRIMARY KEY, envelope TEXT NOT NULL)")
    execSQL("CREATE TABLE IF NOT EXISTS gmail_seen (id TEXT PRIMARY KEY)")
    // Card statement alerts, sealed like payments and moved into the encrypted journal on unlock.
    execSQL("CREATE TABLE IF NOT EXISTS statements (id TEXT PRIMARY KEY, envelope TEXT NOT NULL)")
  } }
  private fun envelope(t:ParsedTransaction):String {
    val classification=JSONObject().put("method",t.method).put("version",t.classifierVersion)
    t.score?.let{classification.put("score",it)};t.margin?.let{classification.put("margin",it)}
    val j = JSONObject().put("id",t.id).put("amount",t.amount).put("merchant",t.merchant).put("account",t.account).put("bank",t.bank).put("at",t.at).put("category",t.category).put("kind",t.kind).put("review",t.review).put("excluded",false).put("note","").put("source",t.source).put("currency",t.currency).put("classification",classification).put("reason",if(t.review) "Needs your context" else when(t.method){"rule"->"Your merchant rule";"model"->"On-device semantic suggestion";else->"Local merchant match"})
    t.timePrecision?.let { j.put("timePrecision",it) }
    t.reference?.let { j.put("reference", it) }
    t.transactionAt?.let { j.put("transactionAt", it) }
    if(t.supplementaryAlert) j.put("supplementaryAlert", true)
    return seal(j.toString().toByteArray())
  }
  fun capture(t: ParsedTransaction): Boolean = synchronized(lifecycleGuard) {
    if (!ready() || initialEpoch!=prefs.getLong("vaultEpoch",0)) return false
    inbox().use { db ->
      db.beginTransaction()
      try {
        if(t.source=="email" && db.rawQuery("SELECT 1 FROM gmail_seen WHERE id = ?",arrayOf(t.id)).use{it.moveToFirst()})return false
        val values = android.content.ContentValues().apply { put("id", t.id); put("envelope", envelope(t)); put("review",if(t.review)1 else 0) }
        val inserted=db.insertWithOnConflict("inbox", null, values, SQLiteDatabase.CONFLICT_IGNORE)!=-1L
        if(t.source=="email")db.execSQL("INSERT OR IGNORE INTO gmail_seen(id) VALUES (?)",arrayOf(t.id))
        db.setTransactionSuccessful()
        return inserted
      }finally{db.endTransaction()}

    }
  }
  fun seenEmail(id:String):Boolean = synchronized(lifecycleGuard) {
    if(!ready() || initialEpoch!=prefs.getLong("vaultEpoch",0))return false
    inbox().use { db -> db.rawQuery("SELECT 1 FROM gmail_seen WHERE id = ?",arrayOf(id)).use{it.moveToFirst()} }
  }
  /** Update only the still-staged event; never recreate an acknowledged/user-edited row. */
  fun enrichPending(t:ParsedTransaction)=synchronized(lifecycleGuard) {
    if(!ready() || initialEpoch!=prefs.getLong("vaultEpoch",0))return@synchronized
    inbox().use { db ->
      val values=android.content.ContentValues().apply {put("envelope",envelope(t));put("review",if(t.review)1 else 0)}
      db.update("inbox",values,"id = ?",arrayOf(t.id))
    }
  }
  /** Seal a companion answer for a payment; applied by the app on its next unlock. */
  fun saveAnswer(id:String,note:String,category:String?):Boolean = synchronized(lifecycleGuard) {
    if(!ready() || initialEpoch!=prefs.getLong("vaultEpoch",0)) return false
    val j=JSONObject().put("id",id).put("note",note.take(500)).put("answeredAt",System.currentTimeMillis())
    category?.let{j.put("category",it)}
    inbox().use { db ->
      val values=android.content.ContentValues().apply{put("id",id);put("envelope",seal(j.toString().toByteArray()))}
      return db.insertWithOnConflict("answers",null,values,SQLiteDatabase.CONFLICT_REPLACE)!=-1L
    }
  }
  fun captureStatement(s: CardStatement): Boolean = synchronized(lifecycleGuard) {
    if (!ready() || initialEpoch!=prefs.getLong("vaultEpoch",0)) return false
    val j = JSONObject().put("id",s.id).put("bank",s.bank).put("account",s.account).put("totalDue",s.totalDue).put("dueDate",s.dueDate).put("at",s.at)
    s.minimumDue?.let { j.put("minimumDue", it) }
    inbox().use { db ->
      val values = android.content.ContentValues().apply { put("id", s.id); put("envelope", seal(j.toString().toByteArray())) }
      val added = db.insertWithOnConflict("statements", null, values, SQLiteDatabase.CONFLICT_IGNORE) != -1L
      if (added) CardDueReminders.schedule(context, s)
      return added
    }
  }
  fun statements(): List<String> = inbox().use { db -> db.rawQuery("SELECT envelope FROM statements LIMIT 250", null).use { c -> buildList { while(c.moveToNext()) { val e=c.getString(0); if(store.containsAlias(sealedBy(e))) add(String(unseal(e))) } } } }
  fun acknowledgeStatements(ids: List<String>) = inbox().use { db -> db.beginTransaction(); try { ids.forEach { db.delete("statements", "id = ?", arrayOf(it)) }; db.setTransactionSuccessful() } finally { db.endTransaction() } }
  fun answers(): List<String> = inbox().use { db -> db.rawQuery("SELECT envelope FROM answers LIMIT 250", null).use { c -> buildList { while(c.moveToNext()) { val e=c.getString(0); if(store.containsAlias(sealedBy(e))) add(String(unseal(e))) } } } }
  fun acknowledgeAnswers(ids: List<String>) = inbox().use { db -> db.beginTransaction(); try { ids.forEach { db.delete("answers", "id = ?", arrayOf(it)) }; db.setTransactionSuccessful() } finally { db.endTransaction() } }
  fun answerCount(): Int = inbox().use { db -> db.rawQuery("SELECT COUNT(*) FROM answers", null).use { c -> c.moveToFirst(); c.getInt(0) } }
  fun pending(): List<String> = inbox().use { db -> db.rawQuery("SELECT envelope FROM inbox LIMIT 250", null).use { c -> buildList { while(c.moveToNext()) { val e=c.getString(0); if(store.containsAlias(sealedBy(e))) add(String(unseal(e))) } } } }
  fun pendingCount(): Int = inbox().use { db -> db.rawQuery("SELECT COUNT(*) FROM inbox", null).use { c -> c.moveToFirst(); c.getInt(0) } }
  fun pendingReviewCount(): Int = inbox().use { db -> db.rawQuery("SELECT COUNT(*) FROM inbox WHERE review = 1", null).use { c -> c.moveToFirst(); c.getInt(0) } }
  fun acknowledge(ids: List<String>) = inbox().use { db -> db.beginTransaction(); try { ids.forEach { db.delete("inbox", "id = ?", arrayOf(it)) }; db.setTransactionSuccessful() } finally { db.endTransaction() } }
  fun enabled() = prefs.getBoolean("capture", false)
  fun setEnabled(value: Boolean) { val e=prefs.edit().putBoolean("capture",value);if(value&&!prefs.contains("captureSince"))e.putLong("captureSince",System.currentTimeMillis());e.commit() }
  fun security():Map<String,Any> {
    val secure=context.getSystemService(KeyguardManager::class.java).isDeviceSecure
    val backing=if(!ready())"not-initialized" else runCatching {
      val info=KeyFactory.getInstance("RSA","AndroidKeyStore").getKeySpec(store.getKey(activeAlias(),null),KeyInfo::class.java)
      when(info.securityLevel){KeyProperties.SECURITY_LEVEL_STRONGBOX->"StrongBox";KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT->"Trusted environment";else->"Software"}
    }.getOrDefault("Unknown")
    return mapOf("deviceSecure" to secure,"vaultReady" to ready(),"backing" to backing)
  }
  fun keyRetired() = prefs.getBoolean("keyRetired", false)

  /** Re-seals the journal key and every staged item under the other mode's key. Call while authenticated. */
  fun switchLockMode(newMode: String) = synchronized(lifecycleGuard) {
    require(newMode == "device" || newMode == "open")
    if (newMode == lockMode()) return@synchronized
    if (newMode == "device") check(context.getSystemService(KeyguardManager::class.java).isDeviceSecure) { "Set a screen lock on this phone first." }
    val oldAlias = activeAlias()
    val target = if (newMode == "open") openAlias else alias
    val dbKey = databaseKey()
    if (store.containsAlias(target)) store.deleteEntry(target)
    generate(target, authBound = newMode == "device")
    synchronized(inboxGuard) {
      inbox().use { db ->
        db.beginTransaction()
        try {
          for (table in listOf("inbox", "answers", "statements"))
            db.rawQuery("SELECT id, envelope FROM $table", null).use { c ->
              while (c.moveToNext()) {
                val e = c.getString(1)
                if (!store.containsAlias(sealedBy(e))) continue
                db.update(table, android.content.ContentValues().apply { put("envelope", seal(unseal(e), target)) }, "id = ?", arrayOf(c.getString(0)))
              }
            }
          db.setTransactionSuccessful()
        } finally { db.endTransaction() }
      }
      writeEnvelope(dbKey, target)
      prefs.edit().putString("lockMode", newMode).commit()
      if (store.containsAlias(oldAlias)) store.deleteEntry(oldAlias)
    }
  }
  private fun writeEnvelope(dbKey: String, keyAlias: String) {
    val file = AtomicFile(envelopeFile)
    val out = file.startWrite()
    try { out.write(seal(dbKey.toByteArray(), keyAlias).toByteArray()); file.finishWrite(out) } catch (e: Exception) { file.failWrite(out); throw e }
  }

  fun hasRecovery() = recoveryFile.baseFile.exists()
  /** Stores a password-locked copy of the journal key on this phone. Needs the journal to be open. */
  fun setRecoveryPassword(password: String) {
    val wrapped = RecoveryKey.wrap(databaseKey(), password)
    val out = recoveryFile.startWrite()
    try { out.write(wrapped.toByteArray()); recoveryFile.finishWrite(out) } catch (e: Exception) { recoveryFile.failWrite(out); throw e }
  }
  fun clearRecoveryPassword() = recoveryFile.delete()
  /**
   * Opens a journal whose screen-lock key Android deleted. The user proves ownership with the
   * recovery password; the journal key is then sealed under a new key for the current mode.
   * Staged items sealed by the deleted key cannot be read and are dropped (an SMS re-import
   * brings those payments back).
   */
  fun recover(password: String): String = synchronized(lifecycleGuard) {
    check(hasRecovery()) { "No recovery password was set on this phone." }
    val dbKey = RecoveryKey.unwrap(String(recoveryFile.readFully()), password)
    initialize()
    synchronized(inboxGuard) {
      inbox().use { db ->
        for (table in listOf("inbox", "answers", "statements"))
          db.rawQuery("SELECT id, envelope FROM $table", null).use { c ->
            while (c.moveToNext()) if (!store.containsAlias(sealedBy(c.getString(1)))) db.delete(table, "id = ?", arrayOf(c.getString(0)))
          }
      }
      writeEnvelope(dbKey, activeAlias())
      prefs.edit().remove("keyRetired").remove("lockMode").commit()
    }
    dbKey
  }
  fun reset()=synchronized(lifecycleGuard) {
    DriveAutoBackupStore.disable(context)
    prefs.edit().putBoolean("capture",false).putLong("vaultEpoch",prefs.getLong("vaultEpoch",0)+1).commit()
    synchronized(inboxGuard) {
      // Expo SQLite's default directory is filesDir/SQLite; React Native closes it before this reset.
      val ledger=File(context.filesDir,"SQLite/kanakku-v1.db")
      if(ledger.exists())check(SQLiteDatabase.deleteDatabase(ledger)){"Could not remove the journal database. Close Kanakku and retry."}
      SQLiteDatabase.deleteDatabase(File(context.noBackupFilesDir,"sealed-inbox.db"))
      AtomicFile(File(context.noBackupFilesDir,"ledger-key.envelope")).delete()
      if(store.containsAlias(alias))store.deleteEntry(alias)
      if(store.containsAlias(openAlias))store.deleteEntry(openAlias)
      recoveryFile.delete()
      if(store.containsAlias("kanakku-merchant-fingerprints-v1"))store.deleteEntry("kanakku-merchant-fingerprints-v1")
      context.getSharedPreferences("kanakku-merchant-rules",Context.MODE_PRIVATE).edit().clear().commit()
      prefs.edit().remove("ledgerReviewCount").remove("lastReceipt").remove("captureSince").remove("keyRetired").commit()
    }
  }
  companion object { private val inboxGuard=Any();private val lifecycleGuard=Any() }
}
