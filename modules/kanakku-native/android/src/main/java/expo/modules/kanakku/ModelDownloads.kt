package expo.modules.kanakku

import android.content.Context
import androidx.work.*
import org.json.JSONArray
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Downloads weights only, never executable libraries. No journal data enters a request. */
object ModelDownloads {
  data class Spec(val id:String,val asset:String,val bytes:Long,val sha256:String,val url:String)
  private val guard=Any()
  private val locks=mapOf("voice" to Any(),"categories" to Any())
  private val checked=java.util.concurrent.ConcurrentHashMap<String,Pair<Long,Long>>()
  private fun prefs(c:Context)=c.getSharedPreferences("kanakku-model-downloads",Context.MODE_PRIVATE)
  fun specs(c:Context):List<Spec> {
    val rows=JSONArray(c.assets.open("kanakku/model-downloads.json").bufferedReader().use{it.readText()})
    return (0 until rows.length()).map { i -> val j=rows.getJSONObject(i)
      Spec(j.getString("id"),j.getString("asset"),j.getLong("bytes"),j.getString("sha256"),j.getString("url")).also {
        require(it.id in locks && Regex("^[A-Za-z0-9._-]+$").matches(it.asset) && Regex("^[a-f0-9]{64}$").matches(it.sha256) && it.bytes in 1..500_000_000L)
        val u=URI(it.url); require(u.scheme=="https" && u.host=="huggingface.co" && u.userInfo==null && u.query==null && u.fragment==null)
      }
    }
  }
  fun spec(c:Context,id:String)=specs(c).single{it.id==id}
  fun dir(c:Context)=File(c.noBackupFilesDir,"optional-models").apply{mkdirs()}
  private fun file(c:Context,s:Spec)=File(dir(c),"${s.sha256}-${s.asset}")
  private fun partial(c:Context,s:Spec,token:String)=File(dir(c),"${s.id}-$token.partial")
  private fun name(id:String)="kanakku-model-$id"
  private fun lock(id:String)=requireNotNull(locks[id]) { "Unknown model" }
  fun <T> withModel(c:Context,id:String,block:(String)->T):T=synchronized(lock(id)) {
    val s=spec(c,id); var f=file(c,s)
    // Adopt a verified private voice copy from older installations, without another download.
    val legacy=File(File(c.noBackupFilesDir,"voice-models"),s.asset)
    if(!f.exists() && id=="voice" && ModelFiles.verified(legacy,s.bytes,s.sha256)) {
      if(legacy.renameTo(f)) File(legacy.parentFile,"${s.asset}.sha256").delete()
    }
    check(f.isFile && f.length()==s.bytes) { "Download ${if(id=="voice")"English voice" else "smart category suggestions"} in Settings → Optional models first." }
    val stamp=f.length() to f.lastModified()
    if(checked[s.sha256]!=stamp) {
      if(!ModelFiles.verified(f,s.bytes,s.sha256)) {
        f.delete();checked.remove(s.sha256)
        prefs(c).edit().putString("$id.state","error").putLong("$id.bytes",0).commit()
        error("Model integrity check failed. Download it again in Settings.")
      }
      checked[s.sha256]=stamp
    }
    block(f.absolutePath)
  }
  fun status(c:Context):List<Map<String,Any>> = specs(c).map { s ->
    val p=prefs(c);val f=file(c,s)
    val ready=f.isFile && f.length()==s.bytes
    mapOf("id" to s.id,"state" to if(ready)"ready" else p.getString("${s.id}.state","missing").orEmpty().let{if(it=="ready")"missing" else it},"downloaded" to if(ready)s.bytes else p.getLong("${s.id}.bytes",0),"total" to s.bytes)
  }
  fun start(c:Context,id:String) {
    val s=spec(c,id)
    if(runCatching{withModel(c,id){true}}.getOrDefault(false))return
    synchronized(guard) {
    val p=prefs(c)
    if(p.getString("$id.state","") in listOf("queued","downloading","verifying","waiting"))return@synchronized
    val token=UUID.randomUUID().toString()
    dir(c).listFiles()?.filter{it.name.startsWith("$id-")&&it.name.endsWith(".partial")}?.forEach{it.delete()}
    p.edit().putString("$id.token",token).putString("$id.state","queued").putLong("$id.bytes",0).commit()
    val request=OneTimeWorkRequestBuilder<ModelDownloadWorker>()
      .setInputData(workDataOf("id" to s.id,"token" to token))
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build()
    WorkManager.getInstance(c).enqueueUniqueWork(name(id),ExistingWorkPolicy.REPLACE,request)
    }
  }
  fun cancel(c:Context,id:String) = synchronized(guard) {
    val s=spec(c,id);val p=prefs(c);val token=p.getString("$id.token",null)
    p.edit().remove("$id.token").putString("$id.state","missing").putLong("$id.bytes",0).commit()
    WorkManager.getInstance(c).cancelUniqueWork(name(id))
    if(token!=null)partial(c,s,token).delete()
  }
  fun remove(c:Context,id:String) {
    cancel(c,id)
    synchronized(lock(id)) {
      val s=spec(c,id); file(c,s).delete().also{check(it || !file(c,s).exists()){ "Could not remove model" }}
      if(id=="voice")File(c.noBackupFilesDir,"voice-models").deleteRecursively()
      checked.remove(s.sha256)
    }
  }
  fun download(c:Context,id:String,token:String,current:()->Boolean) {
    val s=spec(c,id);val p=prefs(c);val temp=partial(c,s,token)
    fun valid()=current() && p.getString("$id.token",null)==token
    fun state(value:String,bytes:Long=temp.length())=synchronized(guard) {
      if(valid())p.edit().putString("$id.state",value).putLong("$id.bytes",bytes).apply()
    }
    try {
    check(valid())
    if(temp.length()>s.bytes)temp.delete()
    var offset=temp.length()
    state("downloading")
    if(offset<s.bytes) {
      var url=URI(s.url).toURL(); var connection:HttpURLConnection?=null
      try {
        for(redirect in 0..5) {
          val conn=url.openConnection() as HttpURLConnection;connection=conn
          conn.instanceFollowRedirects=false;conn.connectTimeout=30_000;conn.readTimeout=30_000
          conn.setRequestProperty("Accept-Encoding","identity")
          if(offset>0)conn.setRequestProperty("Range","bytes=$offset-")
          val code=conn.responseCode
          if(code in listOf(301,302,303,307,308)) {
            check(redirect<5); val next=URI(url.toString()).resolve(conn.getHeaderField("Location")?:error("Missing redirect"))
            check(next.scheme=="https" && next.userInfo==null && (next.host=="huggingface.co" || next.host?.endsWith(".huggingface.co")==true || next.host?.endsWith(".hf.co")==true)){"Untrusted redirect"}
            conn.disconnect();url=next.toURL();continue
          }
          check(code==200||code==206){"Model host unavailable"}
          offset=ModelFiles.resumeOffset(code,conn.getHeaderField("Content-Range"),offset,s.bytes)
          val length=conn.contentLengthLong
          check(length<0 || length==s.bytes-offset){"Unexpected model length"}
          var last=0L
          conn.inputStream.use { input -> java.io.FileOutputStream(temp,offset>0).use { out ->
            ModelFiles.copy(input,out,offset,s.bytes,::valid) { bytes ->
              val now=android.os.SystemClock.elapsedRealtime()
              if(now-last>500){state("downloading",bytes);last=now}
            };out.fd.sync()
          } }
          break
        }
      } finally { connection?.disconnect() }
    }
    state("verifying")
    if(!ModelFiles.verified(temp,s.bytes,s.sha256)) { temp.delete();error("Model integrity check failed") }
    synchronized(lock(id)) { synchronized(guard) {
      check(valid()){ "Download cancelled" }
      check(temp.renameTo(file(c,s))){"Could not install model"}
      checked[s.sha256]=file(c,s).let{it.length() to it.lastModified()}
      state("ready",s.bytes)
    } }
    } finally { if(!valid())temp.delete() }
  }
  fun failed(c:Context,id:String,token:String,retry:Boolean)=synchronized(guard) {
    val p=prefs(c)
    if(p.getString("$id.token",null)==token)p.edit().putString("$id.state",if(retry)"waiting" else "error").commit()
  }
}

class ModelDownloadWorker(c:Context,p:WorkerParameters):Worker(c,p) {
  override fun doWork():Result {
    val id=inputData.getString("id")?:return Result.failure()
    val token=inputData.getString("token")?:return Result.failure()
    return try { ModelDownloads.download(applicationContext,id,token){!isStopped};Result.success() }
    catch(_:Exception) {
      val retry=!isStopped && runAttemptCount<2
      ModelDownloads.failed(applicationContext,id,token,retry)
      if(retry)Result.retry() else Result.failure()
    }
  }
}
