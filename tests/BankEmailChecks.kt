import expo.modules.kanakku.BankEmailParser
import java.time.Instant

fun bankEmailChecks():Int {
  var checks=0
  fun verify(ok:Boolean){checks++;check(ok){"Bank email check $checks failed"}}
  val mailbox="a".repeat(64)
  val received=Instant.parse("2026-10-20T10:00:00Z").toEpochMilli()
  val credit="Rs.345.12 spent on your SBI Credit Card ending 9901 at SAMPLE CAFE on 14/10/26. Txn. not done by you? Report it. Never share your OTP. Offers Rs.200 and Rs.2500."
  val cardAuth=listOf("mx.google.com; dkim=pass header.i=@sbicard.com; dmarc=pass (p=REJECT) header.from=sbicard.com")
  fun card(text:String=credit,from:String="Alerts <notify@sbicard.com>",auth:List<String> = cardAuth,subject:String="Transaction Alert from SBI Card",id:String="abc01234") = BankEmailParser.parse(id,mailbox,from,subject,auth,text,emptyList(),received)
  val c=card()!!
  verify(c.amount==34512L && c.currency=="INR" && c.bank=="SBI Card" && c.account=="9901" && c.merchant=="SAMPLE CAFE")
  verify(c.at=="2026-10-13T18:30:00Z" && c.transactionAt==null && c.timePrecision=="day" && c.source=="email")
  verify(card()!!.id==c.id && card(id="abc01235")!!.id!=c.id)
  verify(card(credit.replace("Rs.345.12","USD35.00"))!!.currency=="USD")
  verify(card(credit.replace("345.12","3,45.12"))==null)
  verify(card(credit.replace("345.12","345.123"))==null)
  verify(card(credit.replace("345.12","0.00"))==null)
  verify(card(from="SBI <fraud@sbicard.com.evil.example>")==null)
  verify(card(from="SBI @sbicard.com <fraud@example.org>")==null)
  verify(card(from="one@sbicard.com, two@sbicard.com")==null)
  verify(card(auth=emptyList())==null)
  verify(card(auth=listOf("mx.google.com; dmarc=fail header.from=sbicard.com")+cardAuth)==null)
  verify(card(auth=listOf("evil.example; dmarc=pass header.from=sbicard.com"))==null)
  verify(card(auth=listOf("mx.google.com; dmarc=pass header.from=sbi.co.in"))==null)
  verify(card(subject="Your order confirmation")==null)
  verify(card(credit.replace("spent on","payment failed on"))==null)
  verify(card(credit.replace("14/10/26","31/02/26"))==null)
  verify(card(credit+credit)==null)
  val rows=listOf("Terminal Owner Name" to "SYNTHETIC MART", "Terminal Id" to "00000000", "Date & Time" to "Oct 10, 2026, 17:00", "Transaction Number" to "TESTREF123456", "Amount (INR)" to "16432.50", "Last 4 Digit of Card" to "X9902", "Transaction Type" to "PURCHASE", "Channel" to "POS / ECOM", "City" to "00000000")
  fun debit(values:List<Pair<String,String>> = rows,from:String="Bank <donotreply@sbi.co.in>",auth:List<String> = listOf("mx.google.com; dmarc=pass header.from=sbi.co.in")) = BankEmailParser.parse("def01234",mailbox,from,"Transaction alert for your State Bank of India Debit Card",auth,"Transaction Alert Message",values,received)
  val d=debit()!!
  verify(d.amount==1643250L && d.bank=="SBI" && d.currency=="INR" && d.account=="9902" && d.reference=="TESTREF123456")
  verify(d.at=="2026-10-10T11:30:00Z" && d.transactionAt==d.at && d.timePrecision=="minute")
  val octoberPurchase=rows.map { (key,value) -> key to when(key) {
    "Terminal Owner Name" -> "WWW AMAZON IN"
    "Transaction Number" -> "628311288436"
    "Amount (INR)" -> "17437.00"
    "Last 4 Digit of Card" -> "X6122"
    else -> value
  } }
  val oct=debit(octoberPurchase)!!
  verify(oct.amount==1_743_700L && oct.merchant=="WWW AMAZON IN" && oct.reference=="628311288436" && oct.account=="6122")
  verify(debit(rows+rows.first())==null)
  verify(debit(rows.filterNot{it.first=="Transaction Number"})==null)
  verify(debit(rows.map{if(it.first=="Transaction Type")it.first to "FAILED" else it})==null)
  verify(debit(rows.map{if(it.first=="Transaction Type")it.first to "REFUND" else it})==null)
  verify(debit(rows.map{if(it.first=="Amount (INR)")it.first to "1,64,325.00" else it})!!.amount==16432500L)
  verify(debit(rows.map{if(it.first=="Amount (INR)")it.first to "16,43.50" else it})==null)
  verify(debit(rows.map{if(it.first=="Date & Time")it.first to "Oct 40, 2026, 17:00" else it})==null)
  verify(debit(from="Bank <donotreply@sbi.bank.in>",auth=listOf("mx.google.com; dmarc=pass header.from=sbi.bank.in"))!=null)
  verify(debit(rows.map{if(it.first=="Amount (INR)")it.first to "99999999999999999" else it})==null)
  verify(card(credit.replace("14/10/26","30/10/26"))==null)
  return checks
}
