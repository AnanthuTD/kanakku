package expo.modules.kanakku

import android.util.Base64
import org.json.JSONObject
import org.jsoup.Jsoup
import java.math.BigDecimal

/** No WebView, external image requests, attachments, scripts or raw-mail persistence. */
object GmailPayload {
  /** Returns an ephemeral, content-minimised parser report. Never includes message IDs or raw body text. */
  fun diagnose(message:JSONObject,mailboxHash:String):Map<String,Any?> {
    val payload=message.optJSONObject("payload")
    val headers=payload?.optJSONArray("headers")
    val pairs=headers?.let{h->(0 until h.length()).mapNotNull{i->h.optJSONObject(i)?.let{it.optString("name") to it.optString("value")}}}.orEmpty()
    val from=pairs.filter{it.first.equals("From",true)}.singleOrNull()?.second.orEmpty()
    val domain=BankEmailParser.senderDomain(from)
    val auth=pairs.filter{it.first.equals("Authentication-Results",true)}.map{it.second}
    val subject=pairs.filter{it.first.equals("Subject",true)}.singleOrNull()?.second.orEmpty()
    val kind=when {
      subject.equals("Transaction alert for your State Bank of India Debit Card",true)->"SBI debit"
      subject.equals("Transaction Alert from SBI Card",true)->"SBI Card"
      else->"Other"
    }
    val trusted=BankEmailParser.trusted(from,auth)
    val base=mutableMapOf<String,Any?>("senderDomain" to domain,"alertType" to kind,"authenticationPassed" to trusted)
    if(!trusted){base["outcome"]="sender or DMARC check failed";return base}
    if(kind=="Other"){base["outcome"]="unsupported subject";return base}
    if(message.optLong("sizeEstimate",0)>512_000){base["outcome"]="message exceeds size limit";return base}
    val labels=message.optJSONArray("labelIds")
    if(labels!=null&&(0 until labels.length()).any{labels.optString(it) in setOf("DRAFT","SENT","SPAM","TRASH")}){base["outcome"]="excluded Gmail label";return base}
    val mimeTypes=mutableSetOf<String>();val rowKeys=mutableSetOf<String>()
    fun inspect(part:JSONObject,depth:Int){
      if(depth>8||part.optString("filename").isNotEmpty())return
      part.optString("mimeType").takeIf{it=="text/html"||it=="text/plain"}?.let(mimeTypes::add)
      if(part.optString("mimeType")=="text/html"){
        val encoded=part.optJSONObject("body")?.optString("data").orEmpty()
        val html=runCatching{String(Base64.decode(encoded,Base64.URL_SAFE or Base64.NO_WRAP),Charsets.UTF_8)}.getOrNull().orEmpty()
        Jsoup.parse(html).select("tr").forEach{tr->
          val cells=tr.children().filter{it.tagName() in setOf("td","th")}
          if(cells.size==2)rowKeys.add(cells[0].text().trim().lowercase().replace(Regex("\\s+")," ").take(80))
        }
      }
      part.optJSONArray("parts")?.let{children->for(i in 0 until minOf(children.length(),40))children.optJSONObject(i)?.let{inspect(it,depth+1)}}
    }
    if(payload!=null)inspect(payload,0)
    val parsed=parse(message,mailboxHash)
    base["mimeTypes"]=mimeTypes.toList().sorted()
    if(parsed!=null){
      base["outcome"]="parsed"
      base["amount"]=BigDecimal(parsed.amount).movePointLeft(2).toPlainString()
      base["currency"]=parsed.currency
      base["merchant"]=parsed.merchant
      base["transactionDate"]=parsed.transactionAt?:parsed.at
    }else{
      base["outcome"]="template rejected"
      if(kind=="SBI debit"){
        val required=setOf("terminal owner name","last 4 digit of card","amount (inr)","transaction number","transaction type","channel","date & time")
        base["missingRowLabels"]=required-rowKeys
      }
    }
    return base
  }
  fun eligibleMetadata(message:JSONObject):Boolean {
    val p=message.optJSONObject("payload")?:return false
    val h=p.optJSONArray("headers")?:return false
    val pairs=(0 until h.length()).mapNotNull { i->h.optJSONObject(i)?.let{it.optString("name") to it.optString("value")} }
    val from=pairs.filter{it.first.equals("From",true)}.singleOrNull()?.second?:return false
    val subject=pairs.filter{it.first.equals("Subject",true)}.singleOrNull()?.second?:return false
    return BankEmailParser.trusted(from,pairs.filter{it.first.equals("Authentication-Results",true)}.map{it.second}) &&
      (subject.equals("Transaction Alert from SBI Card",true) || subject.equals("Transaction alert for your State Bank of India Debit Card",true))
  }
  fun parse(message:JSONObject,mailboxHash:String):ParsedTransaction? {
    if(message.optLong("sizeEstimate",0)>512_000)return null
    val labels=message.optJSONArray("labelIds")
    if(labels!=null && (0 until labels.length()).any{labels.optString(it) in setOf("DRAFT","SENT","SPAM","TRASH")})return null
    val payload=message.optJSONObject("payload")?:return null
    val headers=payload.optJSONArray("headers")?:return null
    val pairs=(0 until headers.length()).mapNotNull { i -> headers.optJSONObject(i)?.let{it.optString("name") to it.optString("value")} }
    fun one(name:String)=pairs.filter{it.first.equals(name,true)}.singleOrNull()?.second?:""
    val from=one("From");val auth=pairs.filter{it.first.equals("Authentication-Results",true)}.map{it.second}
    if(!BankEmailParser.trusted(from,auth))return null
    var total=0
    val html=mutableListOf<String>();val plain=mutableListOf<String>()
    fun part(p:JSONObject,depth:Int) {
      if(depth>8 || p.optString("filename").isNotEmpty())return
      val mime=p.optString("mimeType")
      if(mime=="text/html" || mime=="text/plain") {
        val encoded=p.optJSONObject("body")?.optString("data").orEmpty()
        if(encoded.length>350_000)return
        val bytes=runCatching{Base64.decode(encoded,Base64.URL_SAFE or Base64.NO_WRAP)}.getOrNull()?:return
        total+=bytes.size;if(total>256_000)return
        val text=String(bytes,Charsets.UTF_8)
        if(mime=="text/html")html.add(text) else plain.add(text)
      }
      p.optJSONArray("parts")?.let{children -> for(i in 0 until minOf(children.length(),40))children.optJSONObject(i)?.let{part(it,depth+1)}}
    }
    part(payload,0);if(total>256_000)return null
    val text:String;val rows:List<Pair<String,String>>
    if(html.isNotEmpty()) {
      val document=Jsoup.parse(html.joinToString("\n"))
      document.select("script,style,noscript,blockquote").remove()
      text=document.text()
      rows=document.select("tr").mapNotNull { tr -> val cells=tr.children().filter{it.tagName() in setOf("td","th")};if(cells.size==2)cells[0].text() to cells[1].text() else null }
    }else {text=plain.joinToString("\n");rows=emptyList()}
    return BankEmailParser.parse(message.optString("id"),mailboxHash,from,one("Subject"),auth,text,rows,message.optLong("internalDate",0))
  }
}
