package expo.modules.kanakku

/** Diagnostics accept structural counters and fixed enums, never free-form error/data text. */
object DiagnosticPrivacy {
  private val events = setOf(
    "app/start", "native/uncaught", "js/uncaught", "ui/shown", "voice/failed", "voice/transcribed",
    "sms/ignored", "sms/captured", "sms/classified", "sms/receive-failed",
    "import/complete", "import/worker-failed", "ledger/flush", "prompt/decision",
    "companion/show-failed", "companion/microphone-service-refused", "companion/shown",
    "companion/dismissed", "companion/voice-fallback-to-app", "companion/listening",
    "companion/recorded", "companion/transcribed", "companion/answer-saved",
  )
  private val counters = setOf("parts", "samples", "ms", "seconds", "words", "months", "scanned", "captured", "lastRunMs", "incoming", "rows", "duplicatesLinked", "awaitingContext", "review")
  private val flags = setOf("voiceSupported", "review", "new", "aborted", "empty", "backfill", "muted", "snoozed", "appOpen", "locked", "overlayAllowed", "overlayOn", "notifications", "on", "preview", "hasAmount", "micPermission", "cpuSupported", "service", "understood", "saved")
  private val enums = mapOf(
    "stage" to setOf("permission", "model", "recording", "transcription", "result"),
    "mode" to setOf("demo", "live"),
    "kind" to setOf("purchase", "income", "refund", "transfer", "card_payment", "cash"),
    "method" to setOf("rule", "merchant", "model", "user", "unknown"),
    "category" to setOf("Food & dining", "Groceries", "Transport", "Shopping", "Bills & utilities", "Entertainment", "Health", "Home", "Uncategorized"),
    "name" to setOf("Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError"),
    "code" to setOf("Error", "TypeError", "VOICE_BUSY", "VOICE_CANCELLED", "VOICE_SILENT_INPUT", "VOICE_RECORDING_FAILED", "VOICE_BACKGROUND", "MIC_PERMISSION"),
  )
  fun allows(source: String, event: String) = "$source/$event" in events
  private val banks = "HDFC|Axis|SBI|SBI Card|Kiwi|Slice|ICICI|Kotak|IDFC FIRST|PNB|Bank of Baroda|Canara|Union Bank|Yes Bank|Federal Bank|Kerala Gramin Bank"
  private val recognisedCounts = Regex("(?:$banks)/(?:purchase|income|refund|transfer|card_payment|cash)=[0-9]{1,9}(?:,(?:$banks)/(?:purchase|income|refund|transfer|card_payment|cash)=[0-9]{1,9})*")
  fun details(input: Map<String, Any?>): Map<String, Any?> = input.filter { (key, value) ->
    (key in counters && value is Number && value.toDouble().isFinite() && value.toDouble() >= 0) ||
      (key in flags && value is Boolean) ||
      (key == "lastRunRecognised" && value is String && value.length <= 1000 && recognisedCounts.matches(value)) || (value is String && value in (enums[key] ?: emptySet()))
  }
}
