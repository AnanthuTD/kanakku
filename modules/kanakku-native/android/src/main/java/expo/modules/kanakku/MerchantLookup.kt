package expo.modules.kanakku

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.KeyStore
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** BYOK stays behind the native boundary, encrypted by a non-exportable Keystore key. */
object MerchantLookup {
  private const val alias = "kanakku-merchant-provider-v1"
  private const val dailyLimit = 20
  private const val monthlyLimit = 300
  private val guard = Any()
  private val connections = mutableSetOf<HttpURLConnection>()
  private var generation = 0

  private fun prefs(context: Context) = context.getSharedPreferences("kanakku-merchant-provider", Context.MODE_PRIVATE)
  private fun day() = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
  private fun month() = SimpleDateFormat("yyyy-MM", Locale.US).format(Date())
  private fun key(create: Boolean): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(alias, null) as? SecretKey)?.let { return it }
    check(create) { "Provider key unavailable. Save it again in Settings." }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  fun settings(context: Context): Map<String, Any> = synchronized(guard) {
    val p = prefs(context)
    mapOf("enabled" to p.getBoolean("enabled", false), "automatic" to p.getBoolean("automatic", false),
      "hasKey" to p.contains("ciphertext"), "dailyUsed" to if(p.getString("day", "") == day()) p.getInt("dailyUsed", 0) else 0,
      "monthlyUsed" to if(p.getString("month", "") == month()) p.getInt("monthlyUsed", 0) else 0,
      "dailyLimit" to dailyLimit, "monthlyLimit" to monthlyLimit)
  }
  fun configure(context: Context, enabled: Boolean, automatic: Boolean, replacementKey: String): Map<String, Any> = synchronized(guard) {
    check(KanakkuModule.foreground) { "Open Kanakku to change provider settings." }
    val p = prefs(context)
    val edit = p.edit()
    if(replacementKey.isNotBlank()) {
      val secret = replacementKey.trim()
      require(secret.length in 16..256 && Regex("[A-Za-z0-9_-]+").matches(secret)) { "Enter a valid Brave Search API key." }
      val bytes = secret.toByteArray(Charsets.UTF_8)
      try {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key(true)) }
        edit.putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
          .putString("ciphertext", Base64.encodeToString(cipher.doFinal(bytes), Base64.NO_WRAP))
      } finally { bytes.fill(0) }
    } else check(!enabled || p.contains("ciphertext")) { "Save your Brave Search API key first." }
    cancel()
    edit.putBoolean("enabled", enabled).putBoolean("automatic", enabled && automatic).commit()
    settings(context)
  }
  fun reset(context: Context) = synchronized(guard) {
    cancel()
    prefs(context).edit().clear().commit()
    KeyStore.getInstance("AndroidKeyStore").apply { load(null); if(containsAlias(alias)) deleteEntry(alias) }
    Unit
  }
  fun cancel() = synchronized(guard) {
    generation++
    connections.toList().forEach { it.disconnect() }
    connections.clear()
  }
  private fun secret(context: Context): String {
    val p = prefs(context)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
      init(Cipher.DECRYPT_MODE, key(false), GCMParameterSpec(128, Base64.decode(p.getString("iv", ""), Base64.NO_WRAP)))
    }
    val bytes = cipher.doFinal(Base64.decode(p.getString("ciphertext", ""), Base64.NO_WRAP))
    return try { String(bytes, Charsets.UTF_8) } finally { bytes.fill(0) }
  }
  fun search(context: Context, label: String, approved: Boolean, kind: String): String {
    val query = MerchantQuery.validate(label, approved, kind)
    val searchText = if(kind == "vpa") "\"$query\"" else "\"$query\" India official business"
    val connection = URL("https://api.search.brave.com/res/v1/web/search?q=" + URLEncoder.encode(searchText, "UTF-8") + "&count=5&country=IN&search_lang=en&safesearch=strict&text_decorations=false&extra_snippets=true").openConnection() as HttpURLConnection
    val requestGeneration: Int
    synchronized(guard) {
      check(KanakkuModule.foreground) { "Merchant lookup runs only while Kanakku is open." }
      val p = prefs(context)
      check(p.getBoolean("enabled", false)) { "Enable web merchant lookup in Settings first." }
      check(approved || p.getBoolean("automatic", false)) { "Automatic business lookup is disabled." }
      check(System.currentTimeMillis() >= p.getLong("retryAt", 0)) { "Search provider is rate limited. Try again later." }
      val d = if(p.getString("day", "") == day()) p.getInt("dailyUsed", 0) else 0
      val m = if(p.getString("month", "") == month()) p.getInt("monthlyUsed", 0) else 0
      check(d < dailyLimit && m < monthlyLimit) { "Kanakku's local lookup allowance is used up. Try again after the next daily or monthly reset." }
      connection.setRequestProperty("X-Subscription-Token", secret(context))
      p.edit().putString("day", day()).putString("month", month()).putInt("dailyUsed", d+1).putInt("monthlyUsed", m+1).commit()
      requestGeneration = generation
      connections.add(connection)
    }
    try {
      connection.connectTimeout = 8_000; connection.readTimeout = 8_000
      connection.instanceFollowRedirects = false
      connection.setRequestProperty("Accept", "application/json")
      val code = connection.responseCode
      if(code == 429) {
        synchronized(guard) { if(generation == requestGeneration) prefs(context).edit().putLong("retryAt", System.currentTimeMillis()+60_000).commit() }
        error("Brave's quota or rate limit was reached. Try again later; the transaction still needs review.")
      }
      check(code in 200..299) { if(code == 401 || code == 403) "Brave rejected the API key or plan. Check it in Settings." else "Merchant search is temporarily unavailable (HTTP $code)." }
      val body = connection.inputStream.use { stream ->
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(4_096)
        val deadline = System.currentTimeMillis()+12_000
        while(true) {
          check(System.currentTimeMillis() < deadline) { "Merchant lookup timed out." }
          val count = stream.read(buffer); if(count < 0) break
          check(output.size()+count <= 256_000) { "Search response exceeded its size limit." }
          output.write(buffer, 0, count)
        }
        output.toString("UTF-8")
      }
      synchronized(guard) { check(requestGeneration == generation) { "Merchant lookup cancelled." } }
      val results = JSONObject(body).optJSONObject("web")?.optJSONArray("results") ?: JSONArray()
      val sources = JSONArray()
      for(i in 0 until minOf(results.length(), 5)) {
        val item = results.optJSONObject(i) ?: continue
        val url = item.optString("url")
        if(!url.startsWith("https://")) continue
        val extra = JSONArray()
        val snippets = item.optJSONArray("extra_snippets") ?: JSONArray()
        for(j in 0 until minOf(snippets.length(), 3)) {
          val snippet = snippets.opt(j)
          if(snippet is String) extra.put(snippet.take(500))
        }
        sources.put(JSONObject().put("title", item.optString("title").take(180)).put("url", url.take(2_048)).put("description", item.optString("description").take(500)).put("extraSnippets", extra))
      }
      return JSONObject().put("sources", sources).toString()
    } finally { synchronized(guard) { connections.remove(connection) }; connection.disconnect() }
  }
}
