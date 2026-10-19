package expo.modules.kanakku

import java.math.BigDecimal
import java.security.MessageDigest
import java.time.*
import java.time.format.DateTimeFormatter
import java.time.format.ResolverStyle
import java.util.Locale

/** Bounded, deterministic SBI templates. Caller discards MIME/HTML after extraction. */
object BankEmailParser {
  private val roots=setOf("sbi.co.in","sbi.bank.in","onlinesbi.com","sbicard.com")
  private fun trustedRoot(domain:String)=roots.firstOrNull{domain==it || domain.endsWith(".$it")}
  fun allowedDomain(domain:String)=trustedRoot(domain)!=null
  fun senderDomain(from:String):String? {
    if(from.length>400 || from.contains('\n') || from.contains('\r'))return null
    val address=if('<' in from)Regex("^[^<>]*<([^<>]+)>\\s*$").matchEntire(from)?.groupValues?.get(1) else from.trim()
    val match=Regex("[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@([A-Za-z0-9.-]+)").matchEntire(address.orEmpty())?:return null
    return match.groupValues[1].lowercase(Locale.ROOT).takeIf(::allowedDomain)
  }
  fun trusted(from:String,authenticationResults:List<String>):Boolean {
    val domain=senderDomain(from)?:return false
    // Gmail prepends its own result. Never accept a lower attacker-supplied pass after a failure.
    val first=authenticationResults.firstOrNull()?.trim().orEmpty()
    if(!first.startsWith("mx.google.com;",ignoreCase=true))return false
    return first.split(';').any { part ->
      Regex("^\\s*dmarc=pass\\b",RegexOption.IGNORE_CASE).containsMatchIn(part) &&
        Regex("\\bheader\\.from=([A-Za-z0-9.-]+)",RegexOption.IGNORE_CASE).find(part)?.groupValues?.get(1)?.lowercase(Locale.ROOT)?.let(::trustedRoot)==trustedRoot(domain)
    }
  }
  private fun amount(value:String):Long?=runCatching {
    require(Regex("(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,2}(?:,[0-9]{2})*,[0-9]{3})(?:\\.[0-9]{1,2})?").matches(value))
    BigDecimal(value.replace(",","")).movePointRight(2).longValueExact().also{require(it in 1..9_007_199_254_740_991L)}
  }.getOrNull()
  private fun digest(text:String)=MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString(""){"%02x".format(it)}
  fun identity(mailboxHash:String,messageId:String)=digest("gmail|$mailboxHash|$messageId")
  fun parse(messageId:String,mailboxHash:String,from:String,subject:String,auth:List<String>,text:String,rows:List<Pair<String,String>>,receivedAt:Long):ParsedTransaction? {
    if(!Regex("[a-fA-F0-9]{1,64}").matches(messageId) || !Regex("[a-f0-9]{64}").matches(mailboxHash) || text.length>256_000 || rows.size>100 || !trusted(from,auth))return null
    val domain=senderDomain(from)!!
    val normalized=subject.trim().replace(Regex("\\s+")," ")
    val credit=domain=="sbicard.com" || domain.endsWith(".sbicard.com")
    return runCatching {
      val merchant:String;val card:String;val minor:Long;val currency:String;val at:Instant;val reference:String?;val precision:String
      if(credit) {
        require(normalized.equals("Transaction Alert from SBI Card",ignoreCase=true))
        val matches=Regex("\\b(Rs\\.?|INR|USD)\\s*([0-9][0-9,.]*)\\s+spent on your SBI Credit Card ending\\s+([0-9]{4})\\s+at\\s+(.{1,100}?)\\s+on\\s+([0-9]{2}/[0-9]{2}/[0-9]{2}(?:[0-9]{2})?)(?![0-9])",RegexOption.IGNORE_CASE).findAll(text).toList()
        require(matches.size==1)
        val g=matches.single().groupValues
        minor=requireNotNull(amount(g[2]));currency=if(g[1].equals("USD",true))"USD" else "INR";card=g[3];merchant=g[4].trim()
        val date=LocalDate.parse(g[5],DateTimeFormatter.ofPattern(if(g[5].length==8)"dd/MM/uu" else "dd/MM/uuuu").withResolverStyle(ResolverStyle.STRICT))
        at=date.atStartOfDay(ZoneId.of("Asia/Kolkata")).toInstant();reference=null;precision="day"
      } else {
        require(normalized.equals("Transaction alert for your State Bank of India Debit Card",true))
        val table=rows.groupBy { it.first.trim().lowercase(Locale.ROOT).replace(Regex("\\s+")," ") }
        fun field(key:String)=table[key]?.singleOrNull()?.second?.trim()?:error("Missing or repeated field")
        require(field("transaction type").equals("PURCHASE",true))
        require(field("channel").uppercase(Locale.ROOT) in setOf("POS / ECOM","POS","ECOM"))
        merchant=field("terminal owner name");card=field("last 4 digit of card").let{Regex("[Xx*]?([0-9]{4})").matchEntire(it)?.groupValues?.get(1)?:error("Invalid card")}
        minor=requireNotNull(amount(field("amount (inr)")));currency="INR"
        reference=field("transaction number").also{require(Regex("[A-Za-z0-9]{6,40}").matches(it))}
        at=LocalDateTime.parse(field("date & time"),DateTimeFormatter.ofPattern("MMM d, uuuu, HH:mm",Locale.ENGLISH).withResolverStyle(ResolverStyle.STRICT)).atZone(ZoneId.of("Asia/Kolkata")).toInstant();precision="minute"
      }
      require(merchant.length in 1..80 && merchant.none{it.isISOControl()})
      require(at.toEpochMilli()<=receivedAt+24*60*60_000L && at.atZone(ZoneId.of("Asia/Kolkata")).year>=2000)
      ParsedTransaction(identity(mailboxHash,messageId),minor,merchant,card,if(credit)"SBI Card" else "SBI",at.toString(),"Uncategorized","purchase",true,reference,method="unknown",classifierVersion="sbi-email-v1",transactionAt=if(precision=="minute")at.toString() else null,source="email",currency=currency,timePrecision=precision)
    }.getOrNull()
  }
}
