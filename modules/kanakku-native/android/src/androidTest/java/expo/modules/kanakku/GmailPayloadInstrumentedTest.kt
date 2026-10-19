package expo.modules.kanakku

import android.util.Base64
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Synthetic Gmail JSON/HTML only; these tests never authorize or read any Google account. */
@RunWith(AndroidJUnit4::class)
class GmailPayloadInstrumentedTest {
  private val c get()=InstrumentationRegistry.getInstrumentation().targetContext.also {check(it.packageName.startsWith("expo.modules.kanakku"))}
  private fun message(html:String,credit:Boolean=false):JSONObject {
    val domain=if(credit)"sbicard.com" else "sbi.co.in"
    val headers=JSONArray().put(JSONObject().put("name","From").put("value","Bank <notice@$domain>"))
      .put(JSONObject().put("name","Subject").put("value",if(credit)"Transaction Alert from SBI Card" else "Transaction alert for your State Bank of India Debit Card"))
      .put(JSONObject().put("name","Authentication-Results").put("value","mx.google.com; dmarc=pass header.from=$domain"))
    return JSONObject().put("id","ab012345").put("internalDate","1792411200000").put("sizeEstimate",10000).put("labelIds",JSONArray().put("INBOX"))
      .put("payload",JSONObject().put("mimeType","text/html").put("headers",headers).put("body",JSONObject().put("data",Base64.encodeToString(html.toByteArray(),Base64.URL_SAFE or Base64.NO_WRAP))))
  }
  @Test fun parsesTableAndIgnoresAdAmountsWithoutLoadingImages() {
    val rows=listOf("Terminal Owner Name" to "SYNTHETIC &amp; MART","Terminal Id" to "00000000","Date &amp; Time" to "Oct 10, 2026, 17:00","Transaction Number" to "TESTREF123456","Amount (INR)" to "16432.50","Last 4 Digit of Card" to "X9902","Transaction Type" to "PURCHASE","Channel" to "POS / ECOM")
    val html="<html><style>.x{content:'INR 99999'}</style><script>fetch('https://example.invalid/never')</script><img src='https://example.invalid/never'><table>"+rows.joinToString(""){(k,v)->"<tr><td>$k</td><td><b>$v</b></td></tr>"}+"</table><p>Offer Rs.200, Rs.2500</p></html>"
    val parsed=GmailPayload.parse(message(html),"a".repeat(64))!!
    assertEquals(1643250L,parsed.amount);assertEquals("SYNTHETIC & MART",parsed.merchant)
    assertEquals("email",parsed.source);assertEquals("INR",parsed.currency)
    assertEquals("2026-10-10T11:30:00Z",parsed.transactionAt)
  }
  @Test fun oneShotDiagnosticReturnsOnlyStructuredSummaryAndNeverBodyOrMessageId() {
    val html="""
      <table><tr><th>Description</th><th>Value</th></tr>
      <tr><td>Terminal Owner Name</td><td>WWW AMAZON IN</td></tr>
      <tr><td>Terminal Id</td><td>89051631</td></tr>
      <tr><td>Date &amp; Time</td><td>Oct 10, 2026, 17:00</td></tr>
      <tr><td>Transaction Number</td><td>628311288436</td></tr>
      <tr><td>Amount (INR)</td><td>17437.00</td></tr>
      <tr><td>Last 4 Digit of Card</td><td>X6122</td></tr>
      <tr><td>Transaction Type</td><td>PURCHASE</td></tr>
      <tr><td>Channel</td><td>POS / ECOM</td></tr></table>
    """.trimIndent()
    val input=message(html)
    val result=GmailPayload.diagnose(input,"a".repeat(64))
    assertEquals("parsed",result["outcome"])
    assertEquals("17437.00",result["amount"])
    assertEquals("WWW AMAZON IN",result["merchant"])
    assertFalse(result.containsKey("id"));assertFalse(result.containsKey("body"));assertFalse(result.containsKey("transactionNumber"))
  }
  @Test fun dmarcRelaxedAlignmentAcceptsSbiAlertSubdomain() {
    val input=message("<table><tr><td>Terminal Owner Name</td><td>WWW AMAZON IN</td></tr><tr><td>Date &amp; Time</td><td>Oct 10, 2026, 17:00</td></tr><tr><td>Transaction Number</td><td>TESTREF123456</td></tr><tr><td>Amount (INR)</td><td>17437.00</td></tr><tr><td>Last 4 Digit of Card</td><td>X6122</td></tr><tr><td>Transaction Type</td><td>PURCHASE</td></tr><tr><td>Channel</td><td>POS / ECOM</td></tr></table>")
    val headers=input.getJSONObject("payload").getJSONArray("headers")
    headers.getJSONObject(0).put("value","State Bank Alerts <alerts@sbi.co.in>")
    headers.getJSONObject(2).put("value","mx.google.com; dmarc=pass header.from=alerts.sbi.co.in")
    assertEquals("parsed",GmailPayload.diagnose(input,"a".repeat(64))["outcome"])
    headers.getJSONObject(2).put("value","mx.google.com; dmarc=pass header.from=attacker.example")
    assertFalse(GmailPayload.eligibleMetadata(input))
  }
  @Test fun creditCurrencyAndAuthenticationAreNotInferredFromPromotionsOrDisplayNames() {
    val html="<p>USD35.00 spent on your SBI Credit Card ending 9901 at SAMPLE STORE on 14/10/26. Txn. not done by you?</p><p>Never share OTP. Offers Rs.200 and Rs.2500.</p>"
    val input=message(html,true)
    val parsed=GmailPayload.parse(input,"a".repeat(64))!!
    assertEquals(3500L,parsed.amount);assertEquals("USD",parsed.currency);assertEquals("day",parsed.timePrecision)
    val payload=input.getJSONObject("payload")
    val auth=payload.getJSONArray("headers").getJSONObject(2)
    auth.put("value","mx.google.com; dmarc=fail header.from=sbicard.com")
    payload.getJSONArray("headers").put(JSONObject().put("name","Authentication-Results").put("value","mx.google.com; dmarc=pass header.from=sbicard.com"))
    assertNull(GmailPayload.parse(input,"a".repeat(64)))
    assertNull(GmailPayload.parse(message(html,true).put("labelIds",JSONArray().put("DRAFT")),"a".repeat(64)))
    assertNull(GmailPayload.parse(message(html,true).put("sizeEstimate",2_000_000),"a".repeat(64)))
  }
  @Test fun manualGmailCheckReplaysSelectedWindowButRoutineSyncKeepsShortOverlap() {
    val floor=1_790_000_000_000L
    val lastSync=1_792_000_000_000L
    assertEquals(floor,GmailSync.scanStart(floor,lastSync,true))
    assertEquals(maxOf(floor,lastSync-2*24*60*60_000L),GmailSync.scanStart(floor,lastSync,false))
  }
  @Test fun gmailSearchIncludesSbiDebitAlertSubdomainAndKeepsSelectedWindow() {
    val query=GmailSync.searchQuery(1_791_619_200_000L,1_792_483_200_000L)
    assertTrue(query.contains("from:alerts.sbi.co.in"))
    assertTrue(query.contains("subject:\"Transaction alert for your State Bank of India Debit Card\""))
    assertTrue(query.contains("after:1791619200"))
    assertTrue(query.contains("before:1792483201"))
  }
  @Test fun accountIdentityIsEncryptedAndLocalDisconnectDropsOnlyConnectionMetadata() {
    GmailSync.detach(c)
    val fake="synthetic-fixture@example.invalid"
    GmailStore.save(c,fake)
    assertEquals(fake,GmailStore.account(c))
    val prefs=File(c.applicationInfo.dataDir,"shared_prefs/kanakku-gmail.xml").readText()
    assertFalse(prefs.contains(fake));assertFalse(prefs.contains("synthetic-fixture"))
    assertTrue(GmailSync.status(c)["connected"] as Boolean)
    val marker=File(c.noBackupFilesDir,"synthetic-journal-marker").apply{writeText("preserve")}
    try {GmailSync.detach(c);assertNull(GmailStore.account(c));assertFalse(GmailSync.status(c)["connected"] as Boolean);assertTrue(marker.exists())}
    finally{marker.delete()}
  }
}
