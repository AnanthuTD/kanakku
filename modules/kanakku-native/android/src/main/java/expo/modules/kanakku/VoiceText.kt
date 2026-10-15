package expo.modules.kanakku

import java.util.Locale

/** Pure text rules shared by the floating companion; mirrors src/native/voice.native.ts. */
object VoiceText {
  // Whisper fills silence and noise with stock captions. Never offer these as notes.
  private val filler = Regex(
    "^(you|thank you|thanks|bye|okay|\\.+|\\[[^\\]]*\\]|\\([^)]*\\)|(thank you|thanks) for watching.*|.*subscribe to (our|my|the) channel.*|please subscribe.*)$",
    RegexOption.IGNORE_CASE,
  )

  fun isFiller(text: String) = filler.matches(text.trim().replace(Regex("[.!\\s]+$"), ""))

  /** Capital first letter and a final stop; nothing else is invented. */
  fun formatNote(text: String): String {
    val note = text.trim().replace(Regex("\\s+"), " ")
    if (note.isEmpty()) return note
    val capital = note.substring(0, 1).uppercase(Locale.ROOT) + note.substring(1)
    return if (capital.last() in ".!?") capital else "$capital."
  }

  /** Payee spelling hint; identifier-like labels (VPAs, card numbers) are never used. */
  fun hint(merchant: String?): String? {
    val name = (merchant ?: "").replace(Regex("[^\\p{L}\\p{N} &'.-]"), " ").replace(Regex("\\s+"), " ").trim().take(60)
    return if (name.isNotEmpty() && !Regex("\\d{4,}").containsMatchIn(name)) "Payment at $name." else null
  }

  /** Mixed purposes require an explicit category; keep native overlay routing conservative. */
  fun isMixedPurpose(text: String): Boolean {
    val patterns = listOf(
      "\\b(swiggy|zomato|restaurant|cafe|chai|coffee|dining|lunch|dinner|breakfast|take[ -]?aways?)\\b",
      "\\b(blinkit|zepto|bigbasket|grocer(?:y|ies)|vegetables|milk)\\b",
      "\\b(uber|ola|rapido|auto|taxi|metro|bus|petrol|fuel|irctc)\\b",
      "\\b(amazon|flipkart|myntra|shopping|clothes|phone case|headphones?|shoes?)\\b",
      "\\b(electricity|broadband|airtel|jio|recharge|water bill|bescom)\\b",
      "\\b(netflix|spotify|cinema|movie|bookmyshow|hotstar)\\b",
      "\\b(pharmacy|hospital|medicine|doctor|apollo|blood tests?)\\b",
      "\\b(rent|maid|cleaner|househelp|plumber)\\b",
    )
    return patterns.count { Regex(it, RegexOption.IGNORE_CASE).containsMatchIn(text) } > 1
  }

  /** "₹1,25,000" style rupees from integer paise, dropping .00. */
  fun rupees(paise: Long): String {
    val whole = (paise / 100).toString()
    // Indian grouping: last three digits, then pairs (1,25,000).
    val grouped = if (whole.length <= 3) whole else {
      val head = whole.dropLast(3)
      head.reversed().chunked(2).joinToString(",").reversed() + "," + whole.takeLast(3)
    }
    val fraction = paise % 100
    return "₹" + grouped + if (fraction == 0L) "" else ".%02d".format(fraction)
  }

  /** The companion's question; payee only when it is a readable name. */
  fun question(paise: Long?, merchant: String?): String {
    val amount = paise?.takeIf { it > 0 }?.let(::rupees)
    val payee = merchant?.trim()?.takeIf { it.isNotEmpty() && !it.contains('@') && !Regex("\\d{6,}").containsMatchIn(it) }
    return when {
      amount != null && payee != null -> "$amount to $payee — what was it for?"
      amount != null -> "$amount just went out — what was it for?"
      else -> "A payment needs context — what was it for?"
    }
  }
}
