package expo.modules.kanakku

import java.security.MessageDigest
import java.time.Instant
import java.util.Locale
import java.math.BigDecimal

data class ParsedTransaction(val id: String, val amount: Long, val merchant: String, val account: String, val bank: String, val at: String, val category: String, val kind: String, val review: Boolean, val reference: String?,val method:String="merchant",val classifierVersion:String="merchant-rules-v1",val score:Double?=null,val margin:Double?=null,val supplementaryAlert:Boolean=false)

object SmsParser {
  private val banks = linkedMapOf("HDFCBK" to "HDFC", "HDFCBN" to "HDFC", "AXISBK" to "Axis", "AXISB" to "Axis", "SBIINB" to "SBI", "SBICRD" to "SBI Card", "SBIUPI" to "SBI", "SBIBNK" to "SBI", "CBSSBI" to "SBI", "ATMSBI" to "SBI", "SBIPSG" to "SBI", "KIWICC" to "Kiwi", "GONIYO" to "Kiwi", "SLICE" to "Slice", "SLICEB" to "Slice", "SLCBNK" to "Slice", "SLCEIT" to "Slice", "ICICIB" to "ICICI", "KOTAKB" to "Kotak", "KOTAK" to "Kotak", "IDFCFB" to "IDFC FIRST", "PNBSMS" to "PNB", "BOBMSG" to "Bank of Baroda", "CANBNK" to "Canara", "UNIONB" to "Union Bank", "YESBNK" to "Yes Bank", "FEDBNK" to "Federal Bank", "KGBANK" to "Kerala Gramin Bank")
  private val amountRe = Regex("(?:Rs\\.?|INR|₹)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)(?![0-9.])", RegexOption.IGNORE_CASE)
  private val amountFormatRe = Regex("(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,2}(?:,[0-9]{2})*,[0-9]{3})(?:\\.[0-9]{1,2})?")
  private val balanceBeforeRe = Regex("\\b(?:avl\\.?\\s*bal(?:ance)?\\.?|available\\s+(?:bal(?:ance)?|credit(?:\\s+limit)?)|bal(?:ance)?|credit\\s+limit)\\s*[:=-]?\\s*$", RegexOption.IGNORE_CASE)
  private val balanceAfterRe = Regex("^\\s*(?:available\\s+(?:balance|credit)|avl\\.?\\s*bal(?:ance)?\\.?|balance)\\b", RegexOption.IGNORE_CASE)
  private val accountRe = Regex("(?:card|a/c|acct|account)(?:\\s+(?:no\\.?|number|ending|ends?|xx|with))?[\\s:*Xx.-]*([0-9]{4,})(?![0-9])", RegexOption.IGNORE_CASE)
  private val refRe = Regex("(?:UPI\\s*(?:Ref|Txn)|Ref(?:erence)?(?:\\s*(?:No|ID))?|UTR|RRN)\\s*[.:#-]?\\s*([A-Za-z0-9]{6,})", RegexOption.IGNORE_CASE)
  fun parse(sender: String, body: String, timestamp: Long): ParsedTransaction? {
    val header = sender.uppercase(Locale.ROOT).replace(Regex("^[A-Z0-9]{2}-"), "").replace(Regex("-[A-Z]$"), "")
    val bank = banks[header] ?: return null
    if (Regex("\\b(OTP|one[ -]time|verification code|authentication code|login|password)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) return null
    if (Regex("\\b(declined|failed|unsuccessful|due|minimum due|statement|scheduled|will be|would be|request|mandate)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) return null
    // An announced or pending refund has not posted and must not reduce spending.
    val refundMentioned = Regex("\\b(refund(?:ed)?|revers(?:al|ed))\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)
    if (refundMentioned && (
      Regex("\\b(initiated|pending|processing)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body) ||
      !Regex("\\b(credited|received|refunded|reversed)\\b|\\b(?:refund|reversal)\\s+(?:of\\s+(?:Rs\\.?|INR|₹)\\s*[0-9,.]+\\s+)?completed\\b|\\breversal of\\b.*\\bwas successful\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)
    )) return null
    val debitAt = Regex("\\b(debited|spent|paid|purchase|charged|sent)\\b|\\b(?:card transaction|(?:IMPS|NEFT|UPI) payment) of\\b.*\\bis successful\\b", RegexOption.IGNORE_CASE).find(body)?.range?.first
    val creditAt = Regex("\\b(credited|received)\\b", RegexOption.IGNORE_CASE).find(body)?.range?.first
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
    val amountText = amountRe.findAll(body).firstOrNull { match ->
      !balanceBeforeRe.containsMatchIn(body.substring(0, match.range.first).takeLast(60)) &&
      !balanceAfterRe.containsMatchIn(body.substring(match.range.last + 1))
    }?.groupValues?.get(1) ?: return null
    if (!amountFormatRe.matches(amountText)) return null
    val amount = runCatching { BigDecimal(amountText.replace(",", "")).movePointRight(2).longValueExact() }.getOrNull() ?: return null
    // The bridge and ledger use JS numbers: a valid Long can still lose paise there.
    if (amount <= 0 || amount > 9007199254740991L) return null
    // slice's older card alerts carry no card digits.
    val account = accountRe.find(body)?.groupValues?.get(1)?.takeLast(4)
      ?: (if (bank == "Slice" && Regex("\\bslice credit card transaction\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) "card" else null) ?: return null
    val ending="(?=\\s+(?:on|using|via|UPI|Ref|ref|Avl|Available|from|by|Not\\s+you)\\b|[.;](?:\\s|$)|\\n|$)"
    val merchant = listOf("\\bat\\s+", "\\bVPA\\s+", "\\bto\\s+(?:VPA\\s+)?(?!a/c\\b|account\\b|card\\b|your\\b)", "\\btransaction of (?:Rs\\.?|INR|₹)\\s*[0-9,.]+\\s+on\\s+").firstNotNullOfOrNull { prefix -> Regex(prefix+"(.+?)"+ending.replace("(?=","(?=\\s+is\\s+successful\\b|"),RegexOption.IGNORE_CASE).find(body)?.groupValues?.get(1)?.trim()?.take(80)?.ifBlank{null} }
      // Bank-to-bank UPI alerts name only the other account; its last four digits let the user recognise and remember it.
      ?: Regex("\\b(?:credited to|debited from) a/c(?:\\s+no\\.?)?\\s*X*([0-9]{2,})", RegexOption.IGNORE_CASE).find(body)?.groupValues?.get(1)?.let { "A/c ••" + it.takeLast(4) }
      ?: "Unknown merchant"
    val reference = refRe.find(body)?.groupValues?.get(1)
    // No amount/time-window dedupe: two same-value payments may both be legitimate.
    val identity = if (reference != null) "$bank|$account|$kind|$reference|$amount" else "$sender|$body|$timestamp"
    val id = MessageDigest.getInstance("SHA-256").digest(identity.toByteArray()).joinToString("") { "%02x".format(it) }
    val category = category(merchant)
    val supplementary = bank == "Kerala Gramin Bank" && reference == null && merchant == "Unknown merchant" &&
      Regex("\\bBal after txn\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)
    return ParsedTransaction(id, amount, merchant, account, bank, Instant.ofEpochMilli(timestamp).toString(), category, kind, kind == "purchase" && category == "Uncategorized", reference, supplementaryAlert=supplementary)
  }
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
