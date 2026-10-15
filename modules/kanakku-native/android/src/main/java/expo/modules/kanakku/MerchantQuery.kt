package expo.modules.kanakku

import java.text.Normalizer
import java.util.Locale

/** Native boundary independently enforces exactly one consented query. */
object MerchantQuery {
  private val brands = setOf("netflix", "spotify", "adobe", "canva", "microsoft", "google", "apple", "youtube", "disney hotstar", "prime video", "amazon", "flipkart", "myntra", "swiggy", "zomato", "blinkit", "zepto", "bigbasket", "uber", "ola", "rapido", "irctc", "airtel", "jio", "act fibernet", "notion", "openai", "anthropic")
  fun validate(label: String, approved: Boolean, kind: String): String {
    require(kind == "business" || kind == "vpa") { "Unknown merchant query type." }
    if(kind == "vpa") {
      check(approved) { "Review the exact UPI ID and approve sending it to Brave first." }
      val vpa = label.trim()
      require(vpa.length <= 164 && Regex("[A-Za-z0-9][A-Za-z0-9._-]{1,99}@[A-Za-z][A-Za-z0-9.-]{1,63}").matches(vpa)) { "Enter one complete UPI ID (VPA), without SMS text or other payment details." }
      return vpa.lowercase(Locale.ROOT)
    }
    val query = Normalizer.normalize(label, Normalizer.Form.NFKC).trim().replace(Regex("\\s+"), " ")
    require(query.length in 2..64 && Regex("[\\p{L} &'.()-]+").matches(query)) { "Search only a public business name, without payment identifiers." }
    require(!Regex("\\b(upi|utr|ifsc|account|credited|debited|received|paid|payment|balance|card|rs|inr|otp)\\b", RegexOption.IGNORE_CASE).containsMatchIn(query)) { "Use a public business name, not a payment description." }
    check(approved || brands.contains(query.lowercase(Locale.ROOT))) { "Confirm a public business name before searching." }
    return query
  }
}
