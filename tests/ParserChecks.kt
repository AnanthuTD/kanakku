import expo.modules.kanakku.SmsParser
import expo.modules.kanakku.WordPiece
import expo.modules.kanakku.ImportWindow
import expo.modules.kanakku.MerchantQuery
import expo.modules.kanakku.ReviewPolicy
import expo.modules.kanakku.VoiceText
import expo.modules.kanakku.DiagnosticPrivacy
import expo.modules.kanakku.CompanionDraftStore
import java.util.Calendar

fun main() {
  var checks = 0
  fun verify(condition: Boolean) { checks++; check(condition) { "Native check $checks failed" } }
  val delivered = java.time.Instant.parse("2026-10-13T05:00:00Z").toEpochMilli()
  fun kgbTime(text: String) = SmsParser.parse("AD-KGBANK-S", "Your A/c XXXX4821 debited Rs.250 Bal after txn Rs.1000 $text -Kerala Gramin Bank", delivered)!!.transactionAt
  verify(kgbTime("Time 13-10-26 10:15:00") == "2026-10-13T04:45:00Z")
  verify(kgbTime("on 13/10/2026 10:15 AM") == "2026-10-13T04:45:00Z")
  verify(kgbTime("on 13/10/26 12:15 AM") == "2026-10-12T18:45:00Z")
  verify(kgbTime("on 12/10/26 12:15 PM") == "2026-10-12T06:45:00Z")
  verify(kgbTime("Time 31-02-26 10:15:00") == null)
  verify(kgbTime("on 13/10/26 00:15 AM") == null)
  verify(kgbTime("Time 13-10-26 25:15:00") == null)
  verify(kgbTime("Time 13-10-26 10:15:99") == null)
  verify(kgbTime("Time 13-10-26 23:15:00") == null)
  verify(kgbTime("Time 01-10-26 10:15:00") == null)
  verify(kgbTime("Time 10:15:00") == null)
  val kgbTimedUpi = SmsParser.parse("AD-KGBANK-S", "Your a/c no. XXXX4821 is debited for Rs.250.00 on 13/10/26 10:15 AM and credited to a/c no. XXXXX7788 (UPI Ref no 612345678901)-Kerala Gramin Bank", delivered)!!
  verify(kgbTimedUpi.transactionAt == "2026-10-13T04:45:00Z")
  verify(kgbTimedUpi.at == "2026-10-13T05:00:00Z")
  val now=1791883200000L
  fun parse(body:String,sender:String="VM-HDFCBK")=SmsParser.parse(sender,body,now)
  val purchase=parse("Rs.420.25 spent on HDFC Bank Card xx4821 at SWIGGY on 13-Oct. Ref 123456789012")!!
  verify(purchase.amount==42025L && purchase.account=="4821" && purchase.category=="Food & dining")
  verify(parse("Rs.420.25 spent on HDFC Bank Card xx4821 at SWIGGY on 13-Oct. Ref 123456789012")!!.id==purchase.id)
  verify(parse("Rs.420.25 spent on HDFC Bank Card xx4821 at SWIGGY on 13-Oct. Ref 123456789013")!!.id!=purchase.id)
  verify(parse("Your OTP is 812344 to pay Rs.500 on Card xx4821 at AMAZON")==null)
  verify(parse("Rs.500 debited from a/c xx4821 to Rahul on 13-Oct", "+919876543210")==null)
  verify(parse("Rs.500 purchase declined on Card xx4821 at SWIGGY")==null)
  verify(parse("Your card xx4821 statement: amount due Rs.1200")==null)
  verify(parse("Rs.1200 credited as payment received for your Card xx4821")!!.kind=="card_payment")
  verify(parse("Refund of INR 120.00 credited to card xx4821 at AMAZON")!!.kind=="refund")
  verify(parse("Rs.1,234.56 debited from a/c xx4821 to VPA rahul@oksbi on 13-Oct. UPI Ref 987654321001")!!.let{it.amount==123456L && it.review && it.merchant=="rahul@oksbi"})
  verify(parse("Rs.1200 spent on SBI Card ending 6218 at AMAZON on 13-Oct", "AD-SBICRD")!!.bank=="SBI Card")
  verify(parse("INR 1299.00 spent on Axis Bank Card XX8046 at FLIPKART on 13-Oct", "AX-AXISBK")!!.category=="Shopping")
  verify(parse("Rs.500 spent at a shop without any account details")==null)
  verify(parse("Rs.0 spent on card xx4821 at SWIGGY")==null)
  val vocab=mapOf("[CLS]" to 101,"[SEP]" to 102,"[UNK]" to 100,"auto" to 1,"to" to 2,"office" to 3,"cafe" to 4,"##s" to 5)
  val tokenizer=WordPiece(vocab)
  verify(tokenizer.encode("AUTO to office").contentEquals(longArrayOf(101,1,2,3,102)))
  verify(tokenizer.encode("cafés").contentEquals(longArrayOf(101,4,5,102)))
  verify(tokenizer.encode("unknown").contentEquals(longArrayOf(101,100,102)))
  verify(tokenizer.encode("auto ".repeat(100)).size==64)
  val end=Calendar.getInstance().apply { set(2024,Calendar.MARCH,31,14,30,0);set(Calendar.MILLISECOND,0) }
  val start=Calendar.getInstance().apply { timeInMillis=ImportWindow.since(1,end.timeInMillis) }
  verify(start.get(Calendar.MONTH)==Calendar.FEBRUARY && start.get(Calendar.DAY_OF_MONTH)==29)
  verify(ImportWindow.since(0,end.timeInMillis)==0L)
  verify(ImportWindow.afterCheckpoint(100,4,100,5))
  verify(!ImportWindow.afterCheckpoint(100,5,100,5))
  verify(ImportWindow.afterCheckpoint(99,20,100,5))
  verify(!ImportWindow.afterCheckpoint(101,1,100,5))
  verify(ImportWindow.backfillSince(1000000,1020000)==1000000L)
  verify(ImportWindow.backfillSince(1000000,2000000)==1940000L)
  verify(ImportWindow.coverageSince(100,200,180)==100L)
  verify(ImportWindow.coverageSince(100,200,220)==220L)
  verify(ReviewPolicy.quiet(1380,1320,480))
  verify(ReviewPolicy.quiet(0,1320,480))
  verify(!ReviewPolicy.quiet(480,1320,480))
  verify(!ReviewPolicy.quiet(800,1320,480))
  verify(ReviewPolicy.quiet(700,600,800))
  verify(!ReviewPolicy.quiet(900,600,800))
  verify(parse("Rs.140 debited from a/c xx4821 to VPA rahul.s@oksbi on 13-Oct. UPI Ref 987654321006")!!.merchant=="rahul.s@oksbi")
  verify(parse("Refund of INR 120.00 credited to card xx4821 at AMAZON on 13-Oct")!!.merchant=="AMAZON")
  verify(parse("INR 200 debited from account xx3210 to Lakshmi on 13-Oct", "VM-KIWICC-S")!!.bank=="Kiwi")
  verify(parse("INR 200 credited to account xx3210 on 13-Oct", "AD-SLICE")!!.kind=="income")
  verify(parse("INR 100 spent on card xx4821 at Store Pvt.Ltd on 13-Oct")!!.merchant=="Store Pvt.Ltd")
  verify(parse("INR 9999999999999999999999999999999 spent on card xx4821 at SWIGGY")==null)
  // Shapes seen on a real phone (digits, names and references replaced): Kerala Gramin Bank and slice.
  val kgbUpi=parse("Your a/c no. XXXX4821 is debited for Rs.250.00 on 13/10/26 10:15 AM and credited to a/c no. XXXXX7788 (UPI Ref no 612345678901)-Kerala Gramin Bank","AD-KGBANK-S")!!
  verify(kgbUpi.bank=="Kerala Gramin Bank" && kgbUpi.kind=="purchase" && kgbUpi.amount==25000L && kgbUpi.account=="4821" && kgbUpi.reference=="612345678901" && kgbUpi.merchant=="A/c ••7788" && kgbUpi.review)
  // "credited by … and debited from" is money arriving: the first direction verb decides.
  verify(parse("Your a/c no.XXXX4821 is credited by Rs.250.00 on 13/10/26 10:15 PM and debited from a/c no.XXXX7788(UPI Ref no 612345678902)-Kerala Gramin Bank","JD-KGBANK-T")!!.kind=="income")
  verify(parse("Your A/c XXXXXXXXXX4821 debited Rs.500 for / Bal after txn Rs 1200.50 Info 0 Time 13-10-26 10:15:00 -Kerala Gramin Bank","BZ-KGBANK-S")!!.let{it.kind=="purchase" && it.amount==50000L && it.account=="4821"})
  verify(parse("Your A/c XXXXXXXXXX4821 credited Rs.900 Bal after txn Rs 2100.50 Info 0 Time 13-10-26 10:15:00 -Kerala Gramin Bank","BZ-KGBANK-S")!!.kind=="income")
  verify(parse("For the upcoming mandate set for 20/10/26 ,your account will be debited with Rs.119.00 towards SAMPLE MEDIA for the UPI Mandate .-Kerala Gramin Bank","AD-KGBANK-S")==null)
  verify(parse("Rs. 1,250 spent on your credit card xx4321 at CAFE on 13-Oct-26 (UPI Ref: 612345678903). Not you? Call 080-12345678 - slice","VA-SLCBNK-S")!!.let{it.bank=="Slice" && it.kind=="purchase" && it.amount==125000L && it.merchant=="CAFE" && it.account=="4321"})
  verify(parse("Rs. 1,500 received in slice A/c xx5566 on 13-Oct-26 from Sample Person via UPI (Ref ID: 612345678904). Avl. Bal. Rs. 12,000.50 - slice","VA-SLCBNK-S")!!.let{it.kind=="income" && it.amount==150000L})
  verify(parse("Your slice credit card transaction of Rs. 180 on Sample Store is successful. If not you, call 08012345678 - slice","AD-SLCEIT-S")!!.let{it.bank=="Slice" && it.kind=="purchase" && it.amount==18000L && it.merchant=="Sample Store" && it.account=="card"})
  verify(parse("Your slice UPI credit card bill of Rs. 12,345.67 has been paid successfully via autopay. Thanks for paying on time! - slice","VA-SLCBNK-S")==null)
  verify(parse("Rs.2000 withdrawn at SBI ATM S1AB000123 from A/c X4821 on 13Oct26","AD-ATMSBI-S")!!.let{it.bank=="SBI" && it.kind=="cash"})
  verify(parse("Txn reversal of INR 4.50 at SAMPLE STORE was successful.  Card no. XX8046 13-10-26 10:15:00 IST Avl Limit: INR 900.00 Axis Bank","AX-AXISBK-S")!!.let{it.kind=="refund" && it.amount==450L && it.account=="8046"})
  verify(parse("Txn reversal of INR 4.50 at SAMPLE STORE initiated. Card no. XX8046","AX-AXISBK-S")==null)
  verify(parse("IMPS payment of Rs. 5,000 from A/c xx5566 done on 13-Oct-26 to Sample Person is successful (Ref No: 612345678905). Not you? Call 08012345678 - slice","AD-SLCEIT-S")!!.let{it.kind=="purchase" && it.amount==500000L && it.account=="5566" && it.merchant=="Sample Person"})
  // Synthetic alerts exercise grammar and sender mappings, not real bank coverage.
  val syntheticCards = listOf(
    Triple("AD-HDFCBK", "HDFC", "Rs.799.50 spent on card xx4821 at SWIGGY on 13-Oct. Ref 123456789020"),
    Triple("AX-AXISBK", "Axis", "INR 1,299.99 spent on card ending 8046 at FLIPKART on 13-Oct. Ref 123456789021"),
    Triple("AD-SBICRD", "SBI Card", "₹249.50 spent on Card xx6218 at AMAZON on 13-Oct. Ref 123456789022"),
    Triple("VM-KIWICC-S", "Kiwi", "INR 100.25 debited from account xx3210 to VPA test.person@oksbi on 13-Oct. UPI Ref 123456789023"),
    Triple("AD-SLICE", "Slice", "Rs.80.29 paid on card xx4321 at CAFE on 13-Oct. Ref 123456789024"),
  )
  val amounts = listOf(79950L, 129999L, 24950L, 10025L, 8029L)
  syntheticCards.forEachIndexed { index, (sender, bank, body) ->
    val transaction = parse(body, sender)!!
    verify(transaction.bank == bank && transaction.amount == amounts[index] && transaction.kind == "purchase")
    verify(transaction.reference == "1234567890${20 + index}")
  }
  // Sender prefix/body/time changes coalesce only when bank/account/kind/ref/amount match.
  val refDebit = parse("Rs.200 debited from account xx4821 to VPA sample@oksbi on 13-Oct. UPI Ref 123456789030")!!
  val replay = SmsParser.parse("AD-HDFCBK", "INR 200.00 paid on account ending 4821 to VPA sample@oksbi on 14-Oct. UPI Ref 123456789030", now + 86400000)!!
  verify(refDebit.id == replay.id)
  verify(refDebit.id != parse("Rs.200 debited from account xx4821 to VPA sample@oksbi on 13-Oct. UPI Ref 123456789031")!!.id)
  verify(refDebit.id != parse("Rs.200 debited from account xx9999 to VPA sample@oksbi on 13-Oct. UPI Ref 123456789030")!!.id)
  verify(refDebit.id != parse("Rs.200 debited from account xx4821 to VPA sample@oksbi on 13-Oct. UPI Ref 123456789030", "AX-AXISBK")!!.id)
  verify(refDebit.id != parse("Refund of Rs.200 credited to account xx4821 at SAMPLE on 13-Oct. UPI Ref 123456789030")!!.id)
  verify(refDebit.id != parse("Refund of Rs.50 credited to account xx4821 at SAMPLE on 13-Oct. UPI Ref 123456789030")!!.id)
  val noRefBody = "Rs.200 spent on card xx4821 at CAFE on 13-Oct"
  verify(parse(noRefBody)!!.id == parse(noRefBody)!!.id)
  verify(parse(noRefBody)!!.id != SmsParser.parse("VM-HDFCBK", noRefBody, now + 1)!!.id)
  verify(parse("Reversal of INR 12.29 credited to card xx4821 at AMAZON on 13-Oct. Ref 123456789032")!!.let { it.kind == "refund" && it.amount == 1229L })
  verify(parse("INR 12.29 reversed to card xx4821 at AMAZON on 13-Oct. Ref 123456789032")!!.kind == "refund")
  verify(parse("Refund of INR 12.29 initiated to card xx4821 at AMAZON on 13-Oct") == null)
  verify(parse("Pending refund of INR 12.29 to card xx4821 at AMAZON on 13-Oct") == null)
  verify(parse("INR 12.29 refund will be credited to card xx4821 at AMAZON on 13-Oct") == null)
  verify(parse("Rs.2,000 received as salary in account xx4821")!!.kind == "income")
  verify(parse("Rs.2,000 withdrawn from account xx4821 at ATM on 13-Oct")!!.kind == "cash")
  verify(parse("Rs.2,000 payment credited to your credit card xx4821")!!.kind == "card_payment")
  verify(parse("Rs.200 paid using credit card xx4821 at SWIGGY on 13-Oct")!!.kind == "purchase")
  verify(parse("Rs.200 paid with credit card xx4821 at SWIGGY on 13-Oct")!!.kind == "purchase")
  verify(parse("Rs.2,000 paid towards your credit card xx4821 on 13-Oct")!!.kind == "card_payment")
  verify(parse("Rs.1,23,456.78 spent on card xx4821 at SWIGGY")!!.amount == 12345678L)
  verify(parse("Rs.123,456.78 spent on card xx4821 at SWIGGY")!!.amount == 12345678L)
  for (invalid in listOf("1,2", "12,34", "1,,234", "123,", "1,234,56", "0.001", "-10"))
    verify(parse("Rs.$invalid spent on card xx4821 at SWIGGY") == null)
  verify(parse("Rs.90071992547409.91 spent on card xx4821 at SWIGGY")!!.amount == 9007199254740991L)
  verify(parse("Rs.90071992547409.92 spent on card xx4821 at SWIGGY") == null)
  verify(parse("Rs.100 spent on card xx4821 at SWIGGY AMAZON")!!.let { it.review && it.category == "Uncategorized" })
  verify(parse("Rs.100 spent on card xx4821 at Hometown Supplies")!!.category == "Uncategorized")
  verify(parse("Verification code 123456 for Rs.100 paid on card xx4821 at SWIGGY") == null)
  verify(parse("INR 100 payment unsuccessful on card xx4821 at SWIGGY") == null)
  verify(parse("Available balance INR 9,000.00. INR 200.29 spent on card xx4821 at SWIGGY on 13-Oct")!!.amount == 20029L)
  verify(parse("Avl Bal: Rs.9,000.00. Rs.200.29 debited from account xx4821 to VPA sample@oksbi on 13-Oct")!!.amount == 20029L)
  verify(parse("INR 9,000.00 available balance. INR 200.29 spent on card xx4821 at SWIGGY on 13-Oct")!!.amount == 20029L)
  verify(parse("Rs.1,2 spent on card xx4821 at SWIGGY. Available balance Rs.9000") == null)
  verify(parse("Rs.200 spent on card xx4821 at SWIGGY. Available balance Rs.9000")!!.amount == 20000L)
  verify(MerchantQuery.validate(" SHOP.42@OkAxis ", true, "vpa") == "shop.42@okaxis")
  verify(MerchantQuery.validate("Netflix", false, "business") == "Netflix")
  verify(runCatching { MerchantQuery.validate("shop@oksbi", false, "vpa") }.isFailure)
  verify(runCatching { MerchantQuery.validate("shop@oksbi", true, "business") }.isFailure)
  verify(runCatching { MerchantQuery.validate("shop@oksbi", true, "other") }.isFailure)
  for(value in listOf("INR 500 to shop@oksbi", "shop@oksbi OR netflix", "shop@oksbi other@upi", "shop＠oksbi", "shop@oksbi\nINR 500", "https://shop@oksbi", "shop@oksbi?account=123", "shop@oksbi\""))
    verify(runCatching { MerchantQuery.validate(value, true, "vpa") }.isFailure)
  verify(VoiceText.isFiller(" Thank you for watching this video. ") && VoiceText.isFiller("[BLANK_AUDIO]") && VoiceText.isFiller("you"))
  verify(!VoiceText.isFiller("you owe rent") && !VoiceText.isFiller("Thank you gift for Amma"))
  verify(VoiceText.formatNote(" two packets of milk  one butter ") == "Two packets of milk one butter.")
  verify(VoiceText.formatNote("Hi, how are you?") == "Hi, how are you?" && VoiceText.formatNote("") == "")
  verify(VoiceText.hint("Bombay Cafe") == "Payment at Bombay Cafe." && VoiceText.hint("shop.9876543210@upi") == null)
  verify(VoiceText.rupees(50000) == "₹500" && VoiceText.rupees(12500050) == "₹1,25,000.50" && VoiceText.rupees(1234567890) == "₹1,23,45,678.90")
  verify(VoiceText.question(50000, "Rahul S") == "₹500 to Rahul S — what was it for?")
  verify(VoiceText.question(50000, "rahul@oksbi") == "₹500 just went out — what was it for?")
  verify(VoiceText.question(null, null) == "A payment needs context — what was it for?")
  verify(parse("Your A/c XXXXXXXXXX4821 debited Rs.500 for / Bal after txn Rs 1200.50 Info 0 Time 13-10-26 10:15:00 -Kerala Gramin Bank", "BZ-KGBANK-S")!!.supplementaryAlert)
  verify(!parse("Rs.500 debited from a/c xx4821 on 13-Oct", "AD-KGBANK-S")!!.supplementaryAlert)
  verify(!purchase.supplementaryAlert)
  verify(VoiceText.isMixedPurpose("Taxi ride and takeaway dinner") && VoiceText.isMixedPurpose("Blood tests and shoes"))
  verify(!VoiceText.isMixedPurpose("Taxi ride to office") && !VoiceText.isMixedPurpose("Unknown purpose"))
  verify(DiagnosticPrivacy.details(mapOf("message" to "Alice private medicine", "note" to "secret", "key" to "alphabetic-secret", "account" to 1234, "category" to "Health", "captured" to 2)) == mapOf("category" to "Health", "captured" to 2))
  verify(DiagnosticPrivacy.details(mapOf("name" to "Alice", "code" to "private transcript", "ms" to Double.NaN, "words" to -1)).isEmpty())
  verify(DiagnosticPrivacy.allows("voice", "transcribed") && !DiagnosticPrivacy.allows("Alice", "private note"))
  verify(DiagnosticPrivacy.details(mapOf("lastRunRecognised" to "Kerala Gramin Bank/purchase=2,Axis/refund=1"))["lastRunRecognised"] == "Kerala Gramin Bank/purchase=2,Axis/refund=1")
  verify(DiagnosticPrivacy.details(mapOf("lastRunRecognised" to "Alice/private medicine=1")).isEmpty())
  var draftTime = 1000L
  val drafts = CompanionDraftStore { draftTime }
  val draftId = "a".repeat(64)
  val otherDraftId = "b".repeat(64)
  verify(drafts.put(draftId, "Taxi home", "Transport"))
  verify(drafts.take(otherDraftId) == null)
  verify(drafts.take(draftId) == CompanionDraftStore.Draft("Taxi home", "Transport"))
  verify(drafts.take(draftId) == null)
  verify(!drafts.put("preview", "Preview must not save a draft", "Transport"))
  verify(!drafts.put(draftId, "   ", "Transport"))
  drafts.put(draftId, "x".repeat(900), "Untrusted category")
  verify(drafts.take(draftId) == CompanionDraftStore.Draft("x".repeat(800), null))
  drafts.put(draftId, "Old", null)
  draftTime += 300000L
  verify(drafts.take(draftId) == null)
  for (letter in listOf("a", "b", "c", "d")) drafts.put(letter.repeat(64), letter, "Groceries")
  verify(drafts.take(draftId) == null)
  verify(drafts.take("d".repeat(64))?.note == "d")
  drafts.clear()
  verify(drafts.take(otherDraftId) == null)
  println("$checks native parser/tokenizer/import/review-policy/merchant-query checks passed (bank alerts are synthetic).")
}
