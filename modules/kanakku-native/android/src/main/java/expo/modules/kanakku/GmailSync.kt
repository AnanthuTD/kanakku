package expo.modules.kanakku

import android.accounts.Account
import android.content.Context
import androidx.work.*
import com.google.android.gms.auth.api.identity.*
import com.google.android.gms.common.api.Scope
import com.google.android.gms.tasks.Tasks
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.io.ByteArrayOutputStream
import java.time.Instant
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.locks.ReentrantLock

class GmailAuthorizationRequired:Exception()
class GmailHttpFailure(val status:Int):Exception()
object GmailSync {
  const val SCOPE="https://www.googleapis.com/auth/gmail.readonly"
  /** Keep Gmail search aligned with accepted senders; SBI debit alerts use this subdomain. */
  internal fun searchQuery(since:Long,until:Long):String =
    "{from:sbi.co.in from:alerts.sbi.co.in from:sbi.bank.in from:onlinesbi.com from:sbicard.com} " +
      "{subject:\"Transaction Alert from SBI Card\" subject:\"Transaction alert for your State Bank of India Debit Card\"} " +
      "after:${since/1000} before:${until/1000+1}"
  val epoch=AtomicLong()
  private val guard=Any()
  private val runLock=ReentrantLock()
  private val connections=mutableSetOf<HttpURLConnection>()
  private fun p(c:Context)=GmailStore.prefs(c)
  fun hash(value:String)=MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString(""){"%02x".format(it)}
  fun status(c:Context):Map<String,Any> {
    val pref=p(c);val connected=pref.contains("accountCipher")
    val label=runCatching{GmailStore.account(c)?.let{it.take(2)+"•••@"+it.substringAfter('@')}}.getOrNull().orEmpty()
    return mapOf("connected" to connected,"accountLabel" to label,"state" to if(connected)pref.getString("state","connected").orEmpty() else "disconnected","months" to pref.getInt("months",1),"scanned" to pref.getInt("scanned",0),"captured" to pref.getInt("captured",0),"ignored" to pref.getInt("ignored",0),"lastSync" to pref.getLong("lastSync",0))
  }
  fun current(c:Context,ticket:Long)=epoch.get()==ticket && p(c).contains("accountCipher")
  fun request(token:String,path:String,valid:()->Boolean):JSONObject {
    check(valid())
    require(path.startsWith("profile")||path.startsWith("messages"))
    val conn=URL("https://gmail.googleapis.com/gmail/v1/users/me/$path").openConnection() as HttpURLConnection
    synchronized(guard){check(valid());connections.add(conn)}
    try {
      conn.instanceFollowRedirects=false;conn.connectTimeout=20_000;conn.readTimeout=20_000
      conn.setRequestProperty("Authorization","Bearer $token");conn.setRequestProperty("Accept","application/json")
      val code=conn.responseCode
      if(code!=200)throw GmailHttpFailure(code)
      val bytes=ByteArrayOutputStream()
      conn.inputStream.use{input -> val buffer=ByteArray(16384)
        while(true){check(valid());val n=input.read(buffer);if(n<0)break;check(bytes.size()+n<=2_000_000);bytes.write(buffer,0,n)}
      }
      check(valid());return JSONObject(bytes.toString("UTF-8"))
    }finally{synchronized(guard){connections.remove(conn)};conn.disconnect()}
  }
  fun authorized(c:Context,accessToken:String,months:Int,ticket:Long) {
    require(months in setOf(1,3,6,12));check(Vault(c).ready())
    val profile=request(accessToken,"profile"){epoch.get()==ticket}
    val email=profile.getString("emailAddress")
    synchronized(guard) {
      check(epoch.get()==ticket)
      val same=runCatching{GmailStore.account(c)==email}.getOrDefault(false)
      if(!same)p(c).edit().clear().commit()
      GmailStore.save(c,email)
      val edit=p(c).edit().putInt("months",months).putString("state","connected")
      if(!same)edit.putLong("floor",ImportWindow.since(months,System.currentTimeMillis()))
      edit.commit()
      schedule(c)
    }
  }
  fun schedule(c:Context) {
    check(p(c).contains("accountCipher"))
    val constraints=Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
    WorkManager.getInstance(c).enqueueUniquePeriodicWork("kanakku-gmail-periodic",ExistingPeriodicWorkPolicy.KEEP,PeriodicWorkRequestBuilder<GmailSyncWorker>(15,TimeUnit.MINUTES).setConstraints(constraints).build())
    syncNow(c)
  }
  fun syncNow(c:Context) {
    check(p(c).contains("accountCipher"))
    if(p(c).getString("state","")!="syncing")p(c).edit().putString("state","queued").commit()
    try { WorkManager.getInstance(c).enqueueUniqueWork("kanakku-gmail-now",ExistingWorkPolicy.KEEP,OneTimeWorkRequestBuilder<GmailSyncWorker>().setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()) }
    catch(e:Exception){p(c).edit().putString("state","error").commit();throw e}
  }
  /** One-shot, in-memory inspection for support. Does not mutate the vault, counters, or sync checkpoint. */
  fun inspectRecent(c:Context):List<Map<String,Any?>> {
    val account=GmailStore.account(c)?:throw IllegalStateException("Connect Gmail first")
    val access=token(c,account)
    val pref=p(c);val until=System.currentTimeMillis()
    val since=pref.getLong("floor",ImportWindow.since(pref.getInt("months",1),until))
    val query=searchQuery(since,until)
    val report=mutableListOf<Map<String,Any?>>()
    var page=""
    repeat(4){
      val list=request(access,"messages?maxResults=50&q="+URLEncoder.encode(query,"UTF-8")+if(page.isNotEmpty())"&pageToken="+URLEncoder.encode(page,"UTF-8") else ""){true}
      val messages=list.optJSONArray("messages")
      if(messages!=null)for(i in 0 until messages.length()){
        val id=messages.getJSONObject(i).getString("id")
        if(!Regex("[a-fA-F0-9]{1,64}").matches(id))continue
        val meta=try{request(access,"messages/$id?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Authentication-Results"){true}}catch(_:GmailHttpFailure){continue}
        val metaReport=GmailPayload.diagnose(meta,"0".repeat(64))
        val eligible=GmailPayload.eligibleMetadata(meta)
        val full=if(eligible)try{request(access,"messages/$id?format=full"){true}}catch(_:GmailHttpFailure){null}else null
        val safe=if(full!=null)GmailPayload.diagnose(full,hash(account.lowercase())) else metaReport
        val received=meta.optLong("internalDate",0).takeIf{it>0}?.let{Instant.ofEpochMilli(it).toString()}
        report.add(safe+mapOf("message" to (report.size+1),"receivedAt" to received))
      }
      page=list.optString("nextPageToken")
      if(page.isEmpty())return report
    }
    return report
  }
  /** Invalidate in-flight callbacks/requests before dropping account metadata. Saved payments remain. */
  fun detach(c:Context) = synchronized(guard) {
    epoch.incrementAndGet();connections.toList().forEach{it.disconnect()};connections.clear()
    WorkManager.getInstance(c).cancelUniqueWork("kanakku-gmail-now");WorkManager.getInstance(c).cancelUniqueWork("kanakku-gmail-periodic")
    GmailStore.clear(c)
  }
  fun disconnect(c:Context):Boolean {
    val account=runCatching{GmailStore.account(c)}.getOrNull()
    detach(c)
    return if(account==null)true else runCatching{
      Tasks.await(Identity.getAuthorizationClient(c).revokeAccess(RevokeAccessRequest.builder().setAccount(Account(account,"com.google")).setScopes(listOf(Scope(SCOPE))).build()),30,TimeUnit.SECONDS);true
    }.getOrDefault(false)
  }
  private fun token(c:Context,account:String):String {
    val result=Tasks.await(Identity.getAuthorizationClient(c).authorize(AuthorizationRequest.builder().setAccount(Account(account,"com.google")).setRequestedScopes(listOf(Scope(SCOPE))).setOptOutIncludingGrantedScopes(true).build()),40,TimeUnit.SECONDS)
    if(result.hasResolution() || SCOPE !in result.grantedScopes)throw GmailAuthorizationRequired()
    return result.accessToken?:throw GmailAuthorizationRequired()
  }
  fun sync(c:Context,alive:()->Boolean):Boolean {
    if(!runLock.tryLock())return true
    val ticket=epoch.get();val pref=p(c)
    fun valid()=alive()&&current(c,ticket)
    try {
      val account=GmailStore.account(c)?:return true
      if(!Vault(c).ready())return false
      var access=token(c,account)
      val until=pref.getLong("scanUntil",0).takeIf{it>0}?:System.currentTimeMillis()
      val since=pref.getLong("scanSince",0).takeIf{it>0}?:maxOf(pref.getLong("floor",until),pref.getLong("lastSync",0)-2*24*60*60_000L)
      synchronized(guard){if(!valid())return true;pref.edit().putLong("scanUntil",until).putLong("scanSince",since).putString("state","syncing").commit()}
      var page=pref.getString("page","").orEmpty()
      val query=searchQuery(since,until)
      fun get(path:String):JSONObject {
        try{return request(access,path,::valid)}catch(e:GmailHttpFailure){
          if(e.status!=401)throw e
          Tasks.await(Identity.getAuthorizationClient(c).clearToken(ClearTokenRequest.builder().setToken(access).build()),20,TimeUnit.SECONDS)
          access=token(c,account);return request(access,path,::valid)
        }
      }
      repeat(4) {
        check(valid())
        val list=get("messages?maxResults=50&q="+URLEncoder.encode(query,"UTF-8")+if(page.isNotEmpty())"&pageToken="+URLEncoder.encode(page,"UTF-8") else "")
        val messages=list.optJSONArray("messages")
        if(messages!=null)for(i in 0 until messages.length()) {
          check(valid());val id=messages.getJSONObject(i).getString("id")
          require(Regex("[a-fA-F0-9]{1,64}").matches(id))
          val eventId=BankEmailParser.identity(hash(account.lowercase()),id)
          if(Vault(c).seenEmail(eventId))continue
          val metadata=try{get("messages/$id?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Authentication-Results")}catch(e:GmailHttpFailure){if(e.status==404)continue else throw e}
          val message=if(GmailPayload.eligibleMetadata(metadata))try{get("messages/$id?format=full")}catch(e:GmailHttpFailure){if(e.status==404)continue else throw e} else null
          val parsed=message?.let{GmailPayload.parse(it,hash(account.lowercase()))}
          synchronized(guard) {
            check(valid())
            if(parsed!=null && !Vault(c).capture(parsed)) {
              // CONFLICT_IGNORE means an already staged row, or no usable vault. Never advance after lost storage.
              check(Vault(c).ready() && Vault(c).seenEmail(parsed.id))
            }
            pref.edit().putInt("scanned",pref.getInt("scanned",0)+1).putInt(if(parsed!=null)"captured" else "ignored",pref.getInt(if(parsed!=null)"captured" else "ignored",0)+1).commit()
          }
          if(parsed!=null)KanakkuModule.notifyArrival()
        }
        page=list.optString("nextPageToken")
        synchronized(guard){check(valid());pref.edit().putString("page",page).commit()}
        if(page.isEmpty()) {
          synchronized(guard){check(valid());pref.edit().remove("page").remove("scanUntil").remove("scanSince").putLong("lastSync",until).putString("state","connected").commit()}
          return true
        }
      }
      return false // Durable page checkpoint; next worker continues this frozen window.
    } catch(_:GmailAuthorizationRequired) {
      synchronized(guard){if(current(c,ticket))pref.edit().putString("state","reconnect").commit()};return true
    } catch(e:Exception) {
      synchronized(guard){if(current(c,ticket)) {
        // Expired/invalid list cursors are replayed idempotently from the same scan floor.
        if(e is GmailHttpFailure && e.status==400)pref.edit().remove("page").commit()
        pref.edit().putString("state",if(e is GmailHttpFailure && e.status in setOf(401,403))"reconnect" else "error").commit()
      }}
      return false
    }finally{runLock.unlock()}
  }
}
class GmailSyncWorker(c:Context,p:WorkerParameters):Worker(c,p) {
  override fun doWork():Result {
    if(!applicationContext.getSystemService(android.os.UserManager::class.java).isUserUnlocked)return Result.retry()
    return if(GmailSync.sync(applicationContext){!isStopped})Result.success() else if(runAttemptCount<5)Result.retry() else Result.failure()
  }
}
