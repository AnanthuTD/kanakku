package expo.modules.kanakku
import android.content.*
import android.provider.Telephony
import java.util.concurrent.Executors
class SmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if(intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    Diagnostics.install(context)
    val vault=Vault(context)
    if(!vault.enabled() || !vault.ready()) return
    val messages=Telephony.Sms.Intents.getMessagesFromIntent(intent)
    if(messages.isEmpty()) return
    val sender=messages.first().originatingAddress ?: return
    val body=messages.joinToString("") { it.messageBody ?: "" }
    val pending=goAsync()
    executor.execute {
      try {
        // Sender IDs of banks are public headers; personal numbers are masked.
        val from=if(Regex("^[A-Za-z]{2}-[A-Za-z0-9]{3,9}$").matches(sender)||Regex("^[A-Za-z]{4,9}$").matches(sender)) sender else "<number>"
        val parsedEvent=SmsParser.parse(sender,body,messages.first().timestampMillis)
        if(parsedEvent==null) Diagnostics.log("info","sms","ignored",mapOf("sender" to from,"parts" to messages.size))
        parsedEvent?.let { parsed ->
          // Durable minimal data comes before model loading/inference. Never store raw SMS.
          val fresh=vault.capture(parsed)
          Diagnostics.log("info","sms","captured",mapOf("sender" to from,"kind" to parsed.kind,"new" to fresh))
          if(fresh) {
            val enriched=runCatching {SemanticClassifier.enrich(context,parsed)}.getOrDefault(parsed)
            runCatching {vault.enrichPending(enriched)}
            Diagnostics.log("info","sms","classified",mapOf("review" to enriched.review,"method" to enriched.method,"category" to enriched.category))
            KanakkuModule.notifyArrival()
            if(enriched.review&&vault.enabled()&&vault.ready())Prompts.show(context,enriched.id,enriched.amount,enriched.merchant)
          }
        }
      }
      catch(e:Exception) { Diagnostics.log("error","sms","receive-failed",emptyMap(),e) }
      finally { pending.finish() }
    }
  }
  companion object { private val executor=Executors.newSingleThreadExecutor() }
}
