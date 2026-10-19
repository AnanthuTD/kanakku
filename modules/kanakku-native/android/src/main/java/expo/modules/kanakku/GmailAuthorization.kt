package expo.modules.kanakku

import android.app.Activity
import android.content.Context
import android.content.Intent
import com.google.android.gms.auth.api.identity.*
import com.google.android.gms.common.api.Scope
import expo.modules.kotlin.Promise
import java.util.concurrent.Executors
import android.os.Handler
import android.os.Looper

/** Interactive permission is requested only after the in-app disclosure. Tokens never enter JS. */
object GmailAuthorization {
  const val REQUEST=42313
  private data class Pending(val context:Context,val months:Int,val ticket:Long,val promise:Promise)
  @Volatile private var pending:Pending?=null
  private val worker=Executors.newSingleThreadExecutor()
  private val main=Handler(Looper.getMainLooper())
  fun begin(activity:Activity,context:Context,months:Int,promise:Promise) {
    if(pending!=null){promise.reject("GMAIL_BUSY","Finish the current Google connection first.",null);return}
    if(months !in setOf(1,3,6,12) || !Vault(context).ready()) {promise.reject("GMAIL_VAULT","Unlock your journal before connecting Gmail.",null);return}
    val attempt=Pending(context.applicationContext,months,GmailSync.epoch.incrementAndGet(),promise)
    pending=attempt
    val request=AuthorizationRequest.builder().setRequestedScopes(listOf(Scope(GmailSync.SCOPE))).setOptOutIncludingGrantedScopes(true).setPrompt(AuthorizationRequest.Prompt.SELECT_ACCOUNT).build()
    Identity.getAuthorizationClient(activity).authorize(request).addOnSuccessListener { result ->
      if(pending!==attempt)return@addOnSuccessListener
      try {
        if(result.hasResolution())activity.startIntentSenderForResult(requireNotNull(result.pendingIntent).intentSender,REQUEST,null,0,0,0)
        else finish(attempt,result)
      }catch(_:Exception){fail(attempt)}
    }.addOnFailureListener { fail(attempt) }
  }
  fun result(activity:Activity,requestCode:Int,resultCode:Int,data:Intent?) {
    if(requestCode!=REQUEST)return
    val attempt=pending?:return
    if(resultCode!=Activity.RESULT_OK || data==null){cancel();return}
    try{finish(attempt,Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(data))}catch(_:Exception){fail(attempt)}
  }
  private fun finish(attempt:Pending,result:AuthorizationResult) {
    val token=result.accessToken
    if(result.hasResolution() || token.isNullOrBlank() || GmailSync.SCOPE !in result.grantedScopes){fail(attempt);return}
    worker.execute {
      val ok=runCatching { check(pending===attempt);GmailSync.authorized(attempt.context,token,attempt.months,attempt.ticket) }.isSuccess
      main.post {
        if(pending!==attempt)return@post
        if(ok){pending=null;attempt.promise.resolve(GmailSync.status(attempt.context))}else fail(attempt)
      }
    }
  }
  private fun fail(attempt:Pending) {
    if(pending!==attempt)return
    pending=null;GmailSync.epoch.incrementAndGet()
    attempt.promise.reject("GMAIL_CONNECT","Gmail could not be connected. Try again, or contact support if Google says the app is not authorized.",null)
  }
  fun cancel() {
    val attempt=pending?:return
    pending=null;GmailSync.epoch.incrementAndGet()
    attempt.promise.reject("GMAIL_CANCELLED","Gmail connection cancelled. No new mailbox was connected.",null)
  }
}
