package expo.modules.kanakku

import java.security.MessageDigest
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.Locale
import java.math.BigDecimal

data class ParsedTransaction(val id: String, val amount: Long, val merchant: String, val account: String, val bank: String, val at: String, val category: String, val kind: String, val review: Boolean, val reference: String?,val method:String="merchant",val classifierVersion:String="merchant-rules-v1",val score:Double?=null,val margin:Double?=null,val supplementaryAlert:Boolean=false,val transactionAt:String?=null,val source:String="sms",val currency:String="INR",val timePrecision:String?=null)

/** A card statement alert: what is owed and by when. Amounts are paise; dueDate is ISO yyyy-MM-dd. */
data class CardStatement(val id: String, val bank: String, val account: String, val totalDue: Long, val minimumDue: Long?, val dueDate: String, val at: String)

object SmsParser {
  // DLT sender headers (six letters after the operator prefix). Header recognition only admits a
  // message to parsing; the body must still carry an amount, an account/card and a posted verb.
  private val banks = linkedMapOf(
    "HDFCBK" to "HDFC", "HDFCBN" to "HDFC",
    "ICICIB" to "ICICI", "ICICIT" to "ICICI",
    "SBIINB" to "SBI", "SBIUPI" to "SBI", "SBIBNK" to "SBI", "CBSSBI" to "SBI", "ATMSBI" to "SBI", "SBIPSG" to "SBI", "SBICRD" to "SBI Card",
    "AXISBK" to "Axis", "AXISB" to "Axis",
    "KOTAKB" to "Kotak", "KOTAK" to "Kotak",
    "INDUSB" to "IndusInd", "IDFCFB" to "IDFC FIRST", "IDFCBK" to "IDFC FIRST", "YESBNK" to "Yes Bank", "RBLBNK" to "RBL", "RBLCRD" to "RBL",
    "PNBSMS" to "PNB", "PNBBNK" to "PNB", "BOBMSG" to "Bank of Baroda", "BOBSMS" to "Bank of Baroda", "BOBTXN" to "Bank of Baroda", "BOBCRD" to "Bank of Baroda",
    "CANBNK" to "Canara", "CANARA" to "Canara", "UNIONB" to "Union Bank", "BOIIND" to "Bank of India", "BOIBNK" to "Bank of India",
    "INDBNK" to "Indian Bank", "CENTBK" to "Central Bank", "UCOBNK" to "UCO Bank", "IOBCHN" to "Indian Overseas Bank", "IOBBNK" to "Indian Overseas Bank", "IDBIBK" to "IDBI",
    "FEDBNK" to "Federal Bank", "FEDFIB" to "Federal Bank", "FEDSCP" to "Federal Bank", "FEDSMS" to "Federal Bank",
    "SIBSMS" to "South Indian Bank", "KGBANK" to "Kerala Gramin Bank", "KELBNK" to "Kerala Bank", "DHANBK" to "Dhanlaxmi", "CSBBNK" to "CSB Bank",
    "KVBANK" to "Karur Vysya", "CUBANK" to "City Union Bank", "CUBLTD" to "City Union Bank", "TMBANK" to "Tamilnad Mercantile", "KBLBNK" to "Karnataka Bank",
    "AUBANK" to "AU Bank", "EQUTAS" to "Equitas", "EQUITS" to "Equitas", "UTKSFB" to "Utkarsh", "SSFBNK" to "Suryoday", "BANDHN" to "Bandhan", "SARBNK" to "Saraswat",
    "DBSBNK" to "DBS", "SCBANK" to "Standard Chartered", "HSBCIN" to "HSBC", "AMEXIN" to "Amex",
    "AIRBNK" to "Airtel Payments Bank", "JIOPBS" to "Jio Payments Bank", "IPBMSG" to "India Post Payments Bank",
    "KIWICC" to "Kiwi", "GONIYO" to "Kiwi", "SLICE" to "Slice", "SLICEB" to "Slice", "SLCBNK" to "Slice", "SLCEIT" to "Slice", "ONECRD" to "OneCard")
  private val otpRe = Regex("\\b(OTP|one[ -]time|verification code|authentication code|login|password)\\b", RegexOption.IGNORE_CASE)
  private val noticeRe = Regex("\\b(declined|failed|unsuccessful|due|minimum due|statement|scheduled|will be|would be|request|upcoming)\\b", RegexOption.IGNORE_CASE)
  // Unknown headers that still name a bank or card issuer are parsed, but every result is sent to review.
  private val bankLikeHeader = Regex("^[A-Z]{5,6}$")
  private val bankLikeName = Regex("BNK|BANK|BK$|CRD$|SFB")
  private val amountRe = Regex("(?:Rs\\.?|INR|₹)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)(?![0-9.])", RegexOption.IGNORE_CASE)
  private val foreignAmountRe = Regex("\\b(USD|EUR|GBP|AED|SGD|AUD|CAD|CHF|HKD|JPY|THB|MYR|SAR|QAR|NZD|LKR|NPR)\\s?([0-9][0-9,]*(?:\\.[0-9]{1,2})?)(?![0-9.])")
  private val amountFormatRe = Regex("(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,2}(?:,[0-9]{2})*,[0-9]{3})(?:\\.[0-9]{1,2})?")
  private val balanceBeforeRe = Regex("\\b(?:avl\\.?\\s*(?:bal(?:ance)?|limit|lmt)\\.?|available\\s+(?:bal(?:ance)?|limit|credit(?:\\s+limit)?)|bal(?:ance)?|(?:credit\\s+)?limit|lmt)\\s*[:=-]?\\s*$", RegexOption.IGNORE_CASE)
  private val balanceAfterRe = Regex("^\\s*(?:available\\s+(?:balance|credit|limit)|avl\\.?\\s*(?:bal(?:ance)?|limit|lmt)\\.?|balance)\\b", RegexOption.IGNORE_CASE)
  private val accountRe = Regex("\\b(?:card|a/?c|acct|account)(?:\\s+(?:no\\.?|number|ending|ends?|xx|with))?[\\s:*Xx.-]*((?:[0-9]+[Xx*]+)*[0-9]{3,})(?![0-9])", RegexOption.IGNORE_CASE)
  private val refRe = Regex("(?:UPI\\s*(?:Ref|Txn)|Ref(?:erence)?(?:\\s*(?:No|ID))?|UTR|RRN)\\s*[.:#-]?\\s*([A-Za-z0-9]{6,})", RegexOption.IGNORE_CASE)
  // KGB's two alert templates write local Indian transaction time. Preserve receipt time separately.
  private fun transactionTime(body: String, receivedAt: Long): String? {
    val match = Regex("\\b(?:on|Time)\\s+(\\d{2})[/-](\\d{2})[/-](\\d{4}|\\d{2})\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?(?:\\s*(AM|PM))?\\b", RegexOption.IGNORE_CASE).find(body) ?: return null
    return runCatching {
      val g = match.groupValues
      val year = if (g[3].length == 2) 2000 + g[3].toInt() else g[3].toInt()
      var hour = g[4].toInt()
      if (g[7].isNotEmpty()) {
        require(hour in 1..12)
        hour = hour % 12 + if (g[7].equals("PM", true)) 12 else 0
      }
      val instant = LocalDateTime.of(year, g[2].toInt(), g[1].toInt(), hour, g[5].toInt(), g[6].ifEmpty { "0" }.toInt())
        .atZone(ZoneId.of("Asia/Kolkata")).toInstant()
      // Ignore implausible/future bank timestamps rather than use them as dedupe evidence.
      require(instant.toEpochMilli() <= receivedAt + 5 * 60_000L)
      require(instant.toEpochMilli() >= receivedAt - 7 * 24 * 60 * 60_000L)
      instant.toString()
    }.getOrNull()
  }
  fun parse(sender: String, body: String, timestamp: Long): ParsedTransaction? {
    val upper = sender.uppercase(Locale.ROOT)
    // Carriers append -P to promotional traffic; a promotion is never a posted transaction.
    if (Regex("-P$").containsMatchIn(upper)) return null
    val header = upper.replace(Regex("^[A-Z0-9]{2}-"), "").replace(Regex("-[A-Z]$"), "")
    val known = banks[header]
    val bank = known ?: header.takeIf { bankLikeHeader.matches(it) && bankLikeName.containsMatchIn(it) } ?: return null
    if (otpRe.containsMatchIn(body)) return null
    if (noticeRe.containsMatchIn(body)) return null
    // Mandate notices are announcements unless the alert says the money has actually left the account.
    if (Regex("\\bmandate\\b", RegexOption.IGNORE_CASE).containsMatchIn(body) && !Regex("\\b(?:has been|was|is)\\s+debited\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) return null
    // An announced or pending refund has not posted and must not reduce spending.
    val refundMentioned = Regex("\\b(refund(?:ed)?|revers(?:al|ed))\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)
    if (refundMentioned && (
      Regex("\\b(initiated|pending|processing)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body) ||
      !Regex("\\b(credited|received|refunded|reversed)\\b|\\b(?:refund|reversal)\\s+(?:of\\s+(?:Rs\\.?|INR|₹)\\s*[0-9,.]+\\s+)?completed\\b|\\breversal of\\b.*\\bwas successful\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)
    )) return null
    val debitAt = Regex("\\b(debited|spent|paid|purchase|charged|sent)\\b|\\bDr\\.(?=\\s)|\\b(?:card transaction|(?:IMPS|NEFT|UPI) payment) of\\b.*\\bis successful\\b|\\bAutoPay\\b[\\s\\S]{0,40}?\\bsuccessful\\b", RegexOption.IGNORE_CASE).find(body)?.range?.first
    val creditAt = Regex("\\b(credited|received)\\b|\\bCr\\.(?=\\s)", RegexOption.IGNORE_CASE).find(body)?.range?.first
    val kind = when {
      refundMentioned -> "refund"
      Regex("(?:payment.*(?:received|credited).*(?:card)|(?:card).*payment.*(?:received|credited)|paid\\s+(?:towards|to|for)\\s+(?:your\\s+)?credit\\s+card)", RegexOption.IGNORE_CASE).containsMatchIn(body) -> "card_payment"
      Regex("\\b(withdrawn|withdrawal|ATM)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body) -> "cash"
      // Some alerts name both sides ("credited by … and debited from a/c …"); the first verb describes this account.
      debitAt != null && (creditAt == null || debitAt < creditAt) -> "purchase"
      creditAt != null -> "income"
      else -> return null
    }
    // Explicit balance/limit amounts can precede the payment in an alert.
    // Do not fall back to a balance when the actual payment amount is malformed.
    // A charge in another currency precedes any INR figure (which is then only the limit/balance).
    // It is kept at its original value and contributes nothing to INR spend until the user confirms.
    val foreign = foreignAmountRe.find(body)?.takeIf { match -> amountRe.find(body)?.let { it.range.first > match.range.first } ?: true }
    val currency = foreign?.groupValues?.get(1)?.uppercase(Locale.ROOT) ?: "INR"
    val amountText = foreign?.groupValues?.get(2) ?: amountRe.findAll(body).firstOrNull { match ->
      !balanceBeforeRe.containsMatchIn(body.substring(0, match.range.first).takeLast(60)) &&
      !balanceAfterRe.containsMatchIn(body.substring(match.range.last + 1))
    }?.groupValues?.get(1)
      // SBI's UPI template prints the amount without a currency marker: "debited by 500.0".
      ?: Regex("\\b(?:debited|credited)\\s+(?:by|for|with)\\s+([0-9][0-9,]*(?:\\.[0-9]{1,2})?)(?![0-9.])", RegexOption.IGNORE_CASE).find(body)?.groupValues?.get(1)
      ?: return null
    if (!amountFormatRe.matches(amountText)) return null
    val amount = runCatching { BigDecimal(amountText.replace(",", "")).movePointRight(2).longValueExact() }.getOrNull() ?: return null
    // The bridge and ledger use JS numbers: a valid Long can still lose paise there.
    if (amount <= 0 || amount > 9007199254740991L) return null
    // slice's older card alerts carry no card digits.
    val account = accountRe.find(body)?.groupValues?.get(1)?.takeLastWhile { it.isDigit() }?.takeLast(4)
      ?: (if (bank == "Slice" && Regex("\\bslice credit card transaction\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) "card" else null)
      // Some issuers' UPI alerts omit the account; a known bank plus a UPI reference still identifies the payment.
      ?: (if (known != null && Regex("\\bUPI\\b", RegexOption.IGNORE_CASE).containsMatchIn(body) && (refRe.containsMatchIn(body) || Regex("\\bUPI Mandate\\b", RegexOption.IGNORE_CASE).containsMatchIn(body))) "UPI" else null)
      ?: return null
    // Fraud-help footers ("Not you? Fwd this SMS to … to block UPI") must never become the payee.
    val payeeText = body.split(Regex("\\b(?:not\\s+u|not\\s+you|if\\s+not|fwd|sms\\s+block|to\\s+block|for\\s+dispute)\\b", RegexOption.IGNORE_CASE)).first()
    val ending="(?=\\s+(?:on|using|via|UPI|Ref|ref|Refno|Avl|Available|from|by|for\\s+the|Not\\s+you|[A-Za-z]+\\s+Bank\\s+Card)\\b|\\s+\\d{1,2}[-/]\\d{1,2}[-/]\\d{2,4}\\b|[.;](?:\\s|$)|\\n|$)"
    val merchant = listOf("\\bMerchant:\\s*", "\\bat\\s+", "\\bVPA\\s+", "\\bon\\s+\\d{1,2}-[A-Za-z]{3}-\\d{2,4}\\s+(?:on|at)\\s+", "\\bto\\s+(?:VPA\\s+)?(?!a/c\\b|account\\b|card\\b|your\\b|[0-9])", "\\btransaction of (?:Rs\\.?|INR|₹)\\s*[0-9,.]+\\s+on\\s+",
      // Card alerts that print the merchant after the card number and timestamp (Axis, YES).
      "\\bCard(?:\\s+no\\.?)?\\s+X+[0-9]{3,4}\\s+(?:\\d{2}-\\d{2}-\\d{2,4}\\s+\\d{2}:\\d{2}:\\d{2}\\s+(?:IST\\s+)?)?(?=[A-Za-z@])",
      "\\btowards\\s+(?!UPI\\b|your\\b)").firstNotNullOfOrNull { prefix -> Regex(prefix+"(.+?)"+ending.replace("(?=","(?=\\s+is\\s+successful\\b|"),RegexOption.IGNORE_CASE).find(payeeText)?.groupValues?.get(1)?.trim()
      // A UPI address ends at its handle even when the next sentence follows without a space.
      ?.let { raw -> Regex("^[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9]+").find(raw)?.value ?: raw }?.take(80)?.ifBlank{null} }
      // Preserve the complete visible suffix when the bank masks the account (up to
      // eight digits); if it prints an unmasked number, retain only its last four.
      // The issuer bank is stored separately and is not assumed to be the recipient bank.
      ?: Regex("\\b(?:credited to|debited from) a/c(?:\\s+no\\.?)?\\s*(X+)?([0-9]{2,})", RegexOption.IGNORE_CASE).find(body)?.let { match ->
        val visible = match.groupValues[2]
        val suffix = if (match.groupValues[1].isNotEmpty()) visible.takeLast(8) else visible.takeLast(4)
        "A/c ••$suffix"
      }
      ?: "Unknown merchant"
    val reference = refRe.find(body)?.groupValues?.get(1)
    // No amount/time-window dedupe: two same-value payments may both be legitimate.
    val identity = if (reference != null) "$bank|$account|$kind|$reference|$amount" else "$sender|$body|$timestamp"
    val id = MessageDigest.getInstance("SHA-256").digest(identity.toByteArray()).joinToString("") { "%02x".format(it) }
    val category = category(merchant)
    val supplementary = bank == "Kerala Gramin Bank" && reference == null && merchant == "Unknown merchant" &&
      Regex("\\bBal after txn\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)
    return ParsedTransaction(id, amount, merchant, account, bank, Instant.ofEpochMilli(timestamp).toString(), category, kind, (kind == "purchase" && category == "Uncategorized") || known == null || currency != "INR", reference, method=if (known == null) "unknown-bank-header" else "merchant", supplementaryAlert=supplementary, transactionAt=if(bank == "Kerala Gramin Bank") transactionTime(body, timestamp) else null, currency=currency)
  }
  private val months = listOf("jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec")
  private fun dueDate(text: String, receivedAt: Long): String? {
    val m = Regex("\\b(\\d{1,2})(?:st|nd|rd|th)?(?:[-/ ]([A-Za-z]{3}|\\d{1,2})[-/ ,]+|([A-Za-z]{3})[-/ ,]?)(\\d{4}|\\d{2})\\b").find(text) ?: return null
    return runCatching {
      val d = m.groupValues[1]; val mon = m.groupValues[2].ifEmpty { m.groupValues[3] }; val y = m.groupValues[4]
      val month = mon.toIntOrNull() ?: (months.indexOf(mon.lowercase(Locale.ROOT)) + 1).also { require(it > 0) }
      val year = if (y.length == 2) 2000 + y.toInt() else y.toInt()
      val date = java.time.LocalDate.of(year, month, d.toInt())
      val received = Instant.ofEpochMilli(receivedAt).atZone(ZoneId.of("Asia/Kolkata")).toLocalDate()
      // A due date sits shortly after the statement; anything else is a misread.
      require(!date.isBefore(received.minusDays(3)) && !date.isAfter(received.plusDays(70)))
      date.toString()
    }.getOrNull()
  }
  private fun paise(text: String): Long? = runCatching { BigDecimal(text.replace(",", "")).movePointRight(2).longValueExact() }.getOrNull()
  /** Card statement alerts ("Total due … Min due … Due by …"). Returns null for anything else. */
  fun statement(sender: String, body: String, timestamp: Long): CardStatement? {
    val upper = sender.uppercase(Locale.ROOT)
    if (Regex("-P$").containsMatchIn(upper)) return null
    val header = upper.replace(Regex("^[A-Z0-9]{2}-"), "").replace(Regex("-[A-Z]$"), "")
    val bank = banks[header] ?: return null
    // Statements often advise logging in to pay; only an actual code makes this an authentication message.
    if (Regex("\\b(OTP|one[ -]time|verification code|authentication code)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) return null
    if (!Regex("\\b(statement|bill)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) return null
    if (!Regex("\\bcredit\\s+card\\b|\\bcard\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) return null
    // Payment confirmations mention the bill too; they are not new dues.
    if (Regex("\\b(has been paid|paid successfully|payment (?:of .{0,30})?received|thank you for (?:the )?payment|debited)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) return null
    // Axis prints the balance side: "Dr." is owed, "Cr." is a credit balance with nothing to pay.
    val money = "(?:Rs\\.?|INR|₹)\\s*(?:(Cr)\\.?\\s*|Dr\\.?\\s*)?([0-9][0-9,]*(?:\\.[0-9]{1,2})?)"
    val total = Regex("\\btotal\\s+(?:(?:amt|amount|outstanding|bill)\\.?\\s*)?(?:due)?\\s*(?:is|of)?\\s*[:=-]?\\s*$money", RegexOption.IGNORE_CASE).find(body) ?: return null
    val totalDue = if (total.groupValues[1].isNotBlank()) 0L else paise(total.groupValues[2]) ?: return null
    val minimum = Regex("\\b(?:min(?:imum)?\\.?)\\s+(?:amt|amount)?\\s*due\\s*(?:is|of)?\\s*[:=-]?\\s*$money", RegexOption.IGNORE_CASE).find(body)
      ?.let { if (it.groupValues[1].isNotBlank()) 0L else paise(it.groupValues[2]) }
    val dueText = Regex("\\b(?:due\\s+(?:on|by|date)|payment\\s+due\\s+(?:date|by|on)?|pay\\s+by)\\s*[:=-]?\\s*(.{6,20})", RegexOption.IGNORE_CASE).find(body)?.groupValues?.get(1) ?: return null
    val due = dueDate(dueText, timestamp) ?: return null
    val account = accountRe.find(body)?.groupValues?.get(1)?.takeLastWhile { it.isDigit() }?.takeLast(4) ?: return null
    val id = MessageDigest.getInstance("SHA-256").digest("statement|$bank|$account|$due|$totalDue".toByteArray()).joinToString("") { "%02x".format(it) }
    return CardStatement(id, bank, account, totalDue, minimum, due, Instant.ofEpochMilli(timestamp).toString())
  }

  /** A bank alert that reads like a posted payment but that no template understood. */
  fun unreadable(sender: String, body: String, timestamp: Long): Boolean {
    val upper = sender.uppercase(Locale.ROOT)
    if (Regex("-P$").containsMatchIn(upper)) return false
    val header = upper.replace(Regex("^[A-Z0-9]{2}-"), "").replace(Regex("-[A-Z]$"), "")
    if (banks[header] == null && !(bankLikeHeader.matches(header) && bankLikeName.containsMatchIn(header))) return false
    if (otpRe.containsMatchIn(body) || noticeRe.containsMatchIn(body)) return false
    if (!Regex("(?:Rs\\.?|INR|₹)\\s*[0-9]", RegexOption.IGNORE_CASE).containsMatchIn(body)) return false
    if (!Regex("\\b(debited|credited|spent|paid|sent|received|withdrawn|Dr|Cr)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) return false
    return parse(sender, body, timestamp) == null
  }
  private val templateWords = setOf("rs","inr","debited","credited","spent","paid","sent","received","from","to","a/c","ac","acct","account","card","credit","debit","bank","on","at","via","upi","ref","refno","no","avl","bal","balance","limit","lmt","available","your","you","is","has","been","by","for","with","of","the","and","in","towards","transfer","trf","txn","transaction","imps","neft","rtgs","atm","withdrawn","refund","reversal","reversed","dear","customer","user","not","if","call","sms","block","vpa","dr","cr","thru","dt","date","total","payment","successful","successfully","autopay","wallet","cash","amount","amt","purchase","pos","merchant","ending","ist","info","linked","mandate","executed")
  /** A shareable shape of an alert: every digit becomes 9 and every word outside banking vocabulary becomes "_". */
  fun maskedTemplate(body: String): String = body.replace(Regex("[0-9]"), "9").split(Regex("\\s+")).joinToString(" ") { word ->
    val core = word.lowercase(Locale.ROOT).trim(',', '.', ':', ';', '(', ')', '-', '!', '?', '/')
    val keep = core.isEmpty() || core in templateWords || Regex("^[9,./:-]+$").matches(core) ||
      Regex("^(?:rs\\.?|inr|₹)9[9,.]*$").matches(core) || Regex("^[x*]+9+$").matches(core)
    if (keep) word else "_"
  }.take(400)

  fun category(merchant: String): String {
    val candidates = linkedMapOf(
      "Food & dining" to "\\b(swiggy|zomato|cafe|coffee|restaurant)\\b", "Groceries" to "\\b(blinkit|zepto|bigbasket|groceries)\\b",
      "Transport" to "\\b(uber|ola|rapido|irctc|metro)\\b", "Shopping" to "\\b(amazon|flipkart|myntra)\\b",
      "Bills & utilities" to "\\b(airtel|jio|bescom|electricity)\\b", "Entertainment" to "\\b(netflix|spotify|hotstar|bookmyshow)\\b",
      "Health" to "\\b(apollo|pharmacy|hospital)\\b")
    val matched = candidates.filterValues { Regex(it, RegexOption.IGNORE_CASE).containsMatchIn(merchant) }.keys
    return if (matched.size == 1) matched.first() else "Uncategorized"
  }
}
