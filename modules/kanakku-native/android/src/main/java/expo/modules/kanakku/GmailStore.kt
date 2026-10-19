package expo.modules.kanakku

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Only the selected account identifier is saved, encrypted with a non-exportable Keystore key.
 * Google owns OAuth token caching. Kanakku never persists or exposes an access/refresh token. */
object GmailStore {
  private const val alias="kanakku-gmail-account-v1"
  fun prefs(c:Context)=c.getSharedPreferences("kanakku-gmail",Context.MODE_PRIVATE)
  private fun key(create:Boolean):SecretKey {
    val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
    (store.getKey(alias,null) as? SecretKey)?.let{return it}
    check(create){"Reconnect Gmail"}
    return KeyGenerator.getInstance("AES","AndroidKeyStore").apply{
      init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  @Synchronized fun save(c:Context,email:String) {
    require(email.length<=254 && Regex("[^\\s@]+@[^\\s@]+\\.[^\\s@]+").matches(email))
    val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply{init(Cipher.ENCRYPT_MODE,key(true))}
    val bytes=email.toByteArray()
    try{prefs(c).edit().putString("accountIv",Base64.encodeToString(cipher.iv,Base64.NO_WRAP)).putString("accountCipher",Base64.encodeToString(cipher.doFinal(bytes),Base64.NO_WRAP)).commit()}
    finally{bytes.fill(0)}
  }
  @Synchronized fun account(c:Context):String? {
    val p=prefs(c);if(!p.contains("accountCipher"))return null
    val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply{init(Cipher.DECRYPT_MODE,key(false),GCMParameterSpec(128,Base64.decode(p.getString("accountIv",""),Base64.NO_WRAP)))}
    val bytes=cipher.doFinal(Base64.decode(p.getString("accountCipher",""),Base64.NO_WRAP))
    return try{String(bytes)}finally{bytes.fill(0)}
  }
  @Synchronized fun clear(c:Context) {
    prefs(c).edit().clear().commit()
    KeyStore.getInstance("AndroidKeyStore").apply{load(null);if(containsAlias(alias))deleteEntry(alias)}
  }
}
