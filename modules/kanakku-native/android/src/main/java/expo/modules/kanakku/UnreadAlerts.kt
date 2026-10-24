package expo.modules.kanakku

import android.content.Context
import org.json.JSONArray
import java.security.MessageDigest

/**
 * Bank alerts that looked like payments but could not be read. Only a delivery hash, the public
 * sender header and a masked template (no digits, names or payees) are kept, so the user can
 * choose to share the format and have their bank supported. Nothing is sent automatically.
 */
object UnreadAlerts {
  private const val MAX_IDS = 500
  private const val MAX_SAMPLES = 5
  private fun prefs(c: Context) = c.getSharedPreferences("kanakku-unread", Context.MODE_PRIVATE)

  fun record(c: Context, sender: String, body: String, timestamp: Long) = synchronized(this) {
    if (!SmsParser.unreadable(sender, body, timestamp)) return
    val p = prefs(c)
    val id = MessageDigest.getInstance("SHA-256").digest("$sender|$body|$timestamp".toByteArray()).take(8).joinToString("") { "%02x".format(it) }
    val ids = JSONArray(p.getString("ids", "[]"))
    if ((0 until ids.length()).any { ids.getString(it) == id }) return
    ids.put(id)
    while (ids.length() > MAX_IDS) ids.remove(0)
    val header = sender.uppercase().replace(Regex("^[A-Z0-9]{2}-"), "").replace(Regex("-[A-Z]$"), "")
    val sample = "$header: ${SmsParser.maskedTemplate(body)}"
    val samples = JSONArray(p.getString("samples", "[]"))
    if (samples.length() < MAX_SAMPLES && (0 until samples.length()).none { samples.getString(it) == sample }) samples.put(sample)
    p.edit().putString("ids", ids.toString()).putString("samples", samples.toString()).putInt("count", p.getInt("count", 0) + 1).apply()
    Diagnostics.log("info", "sms", "unreadable", mapOf("header" to header))
  }

  fun status(c: Context): Map<String, Any> {
    val p = prefs(c)
    val samples = JSONArray(p.getString("samples", "[]"))
    return mapOf("count" to p.getInt("count", 0), "samples" to (0 until samples.length()).map { samples.getString(it) })
  }

  fun clear(c: Context) { prefs(c).edit().clear().apply() }
}
