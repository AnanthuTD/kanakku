package expo.modules.kanakku

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.text.Normalizer
import java.util.Locale
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey

/** Only keyed merchant fingerprints and category labels are accessible in the background.
 * Raw merchant aliases and the full rule history remain in the encrypted ledger.
 */
object PersonalRules {
  private const val alias="kanakku-merchant-fingerprints-v1"
  private fun fingerprint(text:String):String {
    val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
    if(!store.containsAlias(alias))KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256,"AndroidKeyStore").apply {init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_SIGN).build())}.generateKey()
    val key=store.getKey(alias,null) as SecretKey
    val normalized=Normalizer.normalize(text,Normalizer.Form.NFKC).trim().lowercase(Locale.ROOT).replace(Regex("\\s+")," ")
    val mac=Mac.getInstance("HmacSHA256").apply{init(key)}
    return Base64.encodeToString(mac.doFinal(normalized.toByteArray()),Base64.NO_WRAP)
  }
  @Synchronized fun save(context:Context,rules:List<Map<String,String>>) {
    val editor=context.getSharedPreferences("kanakku-merchant-rules",Context.MODE_PRIVATE).edit().clear()
    rules.forEach{row->val merchant=row["merchant"];val category=row["category"];if(!merchant.isNullOrBlank()&&category!=null&&category!="Uncategorized")editor.putString(fingerprint(merchant),category)}
    check(editor.commit()) {"Could not save merchant rules"}
  }
  @Synchronized fun lookup(context:Context,merchant:String):String? = runCatching {context.getSharedPreferences("kanakku-merchant-rules",Context.MODE_PRIVATE).getString(fingerprint(merchant),null)}.getOrNull()
}
