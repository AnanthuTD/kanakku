package expo.modules.kanakku

import android.Manifest
import android.content.*
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.provider.Telephony
import android.speech.*
import androidx.biometric.BiometricPrompt
import androidx.biometric.BiometricManager
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import java.lang.ref.WeakReference

class KanakkuModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)
  private var speech: SpeechRecognizer? = null
  private var speechPromise: Promise? = null
  private val pcmRecorder=PcmRecorder()
  @Volatile private var receiptGeneration=0L
  override fun definition() = ModuleDefinition {
    Name("KanakkuNative")
    Events("onTransaction", "onImportProgress")
    OnCreate { instance=WeakReference(this@KanakkuModule); appContext.reactContext?.let { Diagnostics.install(it); Diagnostics.log("info","app","start",mapOf("voiceSupported" to WhisperEngine.supported)) } }
    OnActivityEntersForeground {
      foreground=true
      val activity=appContext.currentActivity
      val reactContext=appContext.reactContext
      // Expo may replay foreground during lazy JSI initialization on mqt_v_js.
      // Window and overlay operations must use Android's main thread.
      if(activity!=null && reactContext!=null) activity.runOnUiThread {
        if(foreground && appContext.currentActivity===activity && !activity.isFinishing && !activity.isDestroyed) {
          AvatarWindow.hide()
          reactContext.stopService(Intent(reactContext,AvatarService::class.java))
          if(Vault(reactContext).ready()) allowScreenshots(activity)
        }
      }
    }
    OnActivityEntersBackground { foreground=false;receiptGeneration++;pcmRecorder.cancel();MerchantLookup.cancel() }
    // Google authorization temporarily hands the Activity to Play Services. Do not
    // cancel its pending result when Expo tears down/recreates this module during
    // that handoff; the singleton authorization coordinator survives the Activity.
    OnDestroy { foreground=false;pcmRecorder.cancel();MerchantLookup.cancel();instance=null; speech?.destroy();speech=null;speechPromise?.reject("CANCELLED","Voice session ended",null);speechPromise=null }
    Function("status") {
      val prefs=context.getSharedPreferences("kanakku-settings",Context.MODE_PRIVATE)
      mapOf("sms" to (ContextCompat.checkSelfPermission(context,Manifest.permission.READ_SMS)==PackageManager.PERMISSION_GRANTED && ContextCompat.checkSelfPermission(context,Manifest.permission.RECEIVE_SMS)==PackageManager.PERMISSION_GRANTED), "overlay" to Settings.canDrawOverlays(context), "capture" to Vault(context).enabled(), "offlineVoice" to SpeechRecognizer.isOnDeviceRecognitionAvailable(context), "overlayEnabled" to prefs.getBoolean("overlay",false), "sounds" to prefs.getBoolean("sounds",true), "testBuild" to (context.packageName==TEST_PACKAGE), "diagnostics" to Diagnostics.enabled(context), "voiceSupported" to WhisperEngine.supported, "debugVoiceClips" to (context.packageName==TEST_PACKAGE && prefs.getBoolean("debugVoiceClips",false)))
    }
    AsyncFunction("unlock") { promise: Promise ->
      try {
        val activity=appContext.currentActivity as? FragmentActivity ?: throw Exception("Open Kanakku to unlock.")
        val vault=Vault(context);vault.initialize()
        val auth=BiometricPrompt(activity,ContextCompat.getMainExecutor(context),object: BiometricPrompt.AuthenticationCallback(){
          override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { try { allowScreenshots(activity); promise.resolve(vault.databaseKey()) } catch(e:Exception) {promise.reject("KEY_UNAVAILABLE","Unable to unlock stored data. Device security may have changed. Reset the journal in Settings to re-import SMS; saved notes and rules cannot be recovered.",e)} }
          override fun onAuthenticationError(code:Int,message:CharSequence) {promise.reject("UNLOCK_CANCELLED",message.toString(),null)}
        })
        auth.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle("Unlock Kanakku").setSubtitle("Your spending stays on this device").setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL).build())
      } catch(e:Exception) {promise.reject("UNLOCK_FAILED",e.message,e)}
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("suggestCategory") { text:String -> val s=SemanticClassifier.suggest(context,text);mapOf("category" to s.category,"similarity" to s.similarity,"margin" to s.margin) }
    AsyncFunction("recognizeReceipt") { uri:String ->
      check(foreground && appContext.currentActivity!=null) { "Open Kanakku to read a bill." }
      val generation=receiptGeneration
      val text=ReceiptOcr.recognize(context,uri)
      check(foreground && generation==receiptGeneration) { "Bill reading cancelled." }
      // Test package, same opt-in switch as voice clips: keep the newest OCR text (never the photo)
      // so recognition on a real bill can be diagnosed. Turning the switch off deletes it.
      if(context.packageName==TEST_PACKAGE&&context.getSharedPreferences("kanakku-settings",Context.MODE_PRIVATE).getBoolean("debugVoiceClips",false))
        runCatching { context.getExternalFilesDir("voice-debug")?.let { dir -> dir.mkdirs(); java.io.File(dir,"receipt-ocr.txt").writeText(text.take(24_000)) } }
      mapOf("text" to text)
    }
    AsyncFunction("saveRules") { rules:List<Map<String,String>> -> PersonalRules.save(context,rules) }
    AsyncFunction("merchantLookupSettings") { MerchantLookup.settings(context) }
    AsyncFunction("configureMerchantLookup") { enabled:Boolean,automatic:Boolean,key:String -> MerchantLookup.configure(context,enabled,automatic,key) }
    AsyncFunction("lookupMerchant") { merchant:String,manuallyApproved:Boolean,kind:String -> MerchantLookup.search(context,merchant,manuallyApproved,kind) }
    AsyncFunction("cancelMerchantLookup") { MerchantLookup.cancel() }
    AsyncFunction("removeMerchantLookup") { MerchantLookup.reset(context);MerchantLookup.settings(context) }
    AsyncFunction("reviewSettings") { ReviewReminders.settings(context) }
    AsyncFunction("saveReviewSettings") { notifications:Boolean,quiet:Boolean,start:Int,end:Int,reminder:Boolean,time:Int -> ReviewReminders.save(context,notifications,quiet,start,end,reminder,time); ReviewReminders.settings(context) }
    AsyncFunction("setReviewCount") { count:Int -> context.getSharedPreferences("kanakku-settings",Context.MODE_PRIVATE).edit().putInt("ledgerReviewCount",count.coerceAtLeast(0)).apply(); if(count==0&&Vault(context).pendingReviewCount()==0)context.getSystemService(android.app.NotificationManager::class.java).cancel(41) }
    AsyncFunction("securityStatus") { Vault(context).security() }
    AsyncFunction("recordAudio") { promise:Promise ->
      if(!foreground||appContext.currentActivity==null){promise.reject("VOICE_BACKGROUND","Open Kanakku to use the microphone.",null);return@AsyncFunction}
      if(ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){promise.reject("MIC_PERMISSION","Microphone permission is required.",null);return@AsyncFunction}
      val test=context.packageName==TEST_PACKAGE
      // Opt-in, isolated test package only: keeps the last 3 raw clips for diagnosis.
      val clips=if(test&&context.getSharedPreferences("kanakku-settings",Context.MODE_PRIVATE).getBoolean("debugVoiceClips",false)) context.getExternalFilesDir("voice-debug") else null
      pcmRecorder.start(promise,test,clips)
    }.runOnQueue(Queues.MAIN)
    OnActivityResult { activity,result -> GmailAuthorization.result(activity,result.requestCode,result.resultCode,result.data) }
    AsyncFunction("gmailStatus") { GmailSync.status(context) }
    AsyncFunction("inspectGmailAlerts") { GmailSync.inspectRecent(context) }
    AsyncFunction("connectGmail") { months:Int,promise:Promise ->
      val activity=appContext.currentActivity
      if(!foreground||activity==null)promise.reject("GMAIL_FOREGROUND","Open Kanakku to connect Gmail.",null)
      else GmailAuthorization.begin(activity,context,months,promise)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("syncGmail") { GmailSync.syncNow(context);GmailSync.status(context) }
    AsyncFunction("disconnectGmail") { GmailAuthorization.cancel();val revoked=GmailSync.disconnect(context);GmailSync.status(context)+mapOf("revoked" to revoked) }
    AsyncFunction("modelDownloads") { ModelDownloads.status(context) }
    AsyncFunction("downloadModel") { id:String ->
      check(foreground) { "Open Kanakku to download a model." }
      ModelDownloads.start(context,id);ModelDownloads.status(context)
    }
    AsyncFunction("cancelModelDownload") { id:String -> ModelDownloads.cancel(context,id);ModelDownloads.status(context) }
    AsyncFunction("removeModel") { id:String ->
      if(id=="categories")SemanticClassifier.removeModel(context) else ModelDownloads.remove(context,id)
      ModelDownloads.status(context)
    }
    AsyncFunction("voiceModelPath") { asset:String, sha256:String, promise:Promise ->
      try { promise.resolve(VoiceModels.path(context,asset,sha256)) }
      catch(_:Exception) { promise.reject("MODEL_NOT_READY","Download English voice in Settings → Optional models first. If already downloaded, remove it and try again.",null) }
    }
    AsyncFunction("logDiagnostic") { level:String, source:String, event:String, detail:String ->
      val json=runCatching{org.json.JSONObject(detail)}.getOrDefault(org.json.JSONObject())
      Diagnostics.log(level.take(10), source.take(20), event.take(60), json.keys().asSequence().take(20).associateWith { json.opt(it) })
    }
    AsyncFunction("setDiagnostics") { enabled:Boolean -> Diagnostics.setEnabled(context,enabled); enabled }
    AsyncFunction("clearDiagnostics") { Diagnostics.clear(context) }
    AsyncFunction("takeCompanionDraft") { id:String ->
      // JS asks only after unlock and finding this exact payment; never expose a draft on a URL.
      check(foreground && appContext.currentActivity!=null) { "Open Kanakku to edit this payment." }
      CompanionDrafts.take(id)?.let { draft ->
        mutableMapOf<String, Any>("note" to draft.note).apply { draft.category?.let { put("category", it) } }
      }
    }
    AsyncFunction("pendingAnswers") { Vault(context).answers() }
    AsyncFunction("acknowledgeAnswers") { ids: List<String> -> Vault(context).acknowledgeAnswers(ids) }
    AsyncFunction("saveDebugTranscript") { text:String ->
      // Same opt-in test-package diagnostics: the app's own text beside the newest clip.
      if(context.packageName!=TEST_PACKAGE||!context.getSharedPreferences("kanakku-settings",Context.MODE_PRIVATE).getBoolean("debugVoiceClips",false)) return@AsyncFunction false
      val clip=context.getExternalFilesDir("voice-debug")?.listFiles{f->f.name.endsWith(".wav")}?.maxByOrNull{it.lastModified()} ?: return@AsyncFunction false
      java.io.File(clip.path.removeSuffix(".wav")+".txt").writeText(text.take(2000))
      true
    }
    AsyncFunction("setDebugVoiceClips") { enabled:Boolean ->
      require(context.packageName==TEST_PACKAGE) { "Voice clip diagnostics exist only in the test build." }
      context.getSharedPreferences("kanakku-settings",Context.MODE_PRIVATE).edit().putBoolean("debugVoiceClips",enabled).commit()
      if(!enabled) context.getExternalFilesDir("voice-debug")?.deleteRecursively()
      enabled
    }
    AsyncFunction("transcribeVoice") { model:String, language:String, translate:Boolean, prompt:String?, threads:Int ->
      require(model.startsWith(VoiceModels.dir(context)+"/")) { "Unexpected voice model." }
      val clip=pcmRecorder.takeClip() ?: throw IllegalStateException("There is no recording to transcribe.")
      val started=android.os.SystemClock.elapsedRealtime()
      try {
        val result=ModelDownloads.withModel(context,"voice") { verified ->
          require(model==verified) { "Unexpected voice model." }
          WhisperEngine.transcribe(verified,clip,threads,language,translate,prompt)
        }
        Diagnostics.log("info","voice","transcribed",mapOf("ms" to android.os.SystemClock.elapsedRealtime()-started,"seconds" to clip.size/16000.0,"aborted" to result.aborted,"language" to result.language,"empty" to result.text.isBlank()))
        mapOf("text" to result.text,"language" to result.language,"aborted" to result.aborted)
      } finally { clip.fill(0) }
    }
    AsyncFunction("stopTranscription") { WhisperEngine.abort() }
    AsyncFunction("finishAudio") { pcmRecorder.finish() }
    AsyncFunction("cancelAudio") { pcmRecorder.cancel() }
    AsyncFunction("resetVault") { confirmation:String ->
      require(confirmation=="RESET") {"Confirm the reset in Kanakku first."}
      GmailAuthorization.cancel();GmailSync.detach(context)
      CompanionDrafts.clear()
      HistoryImport.pause(context)
      androidx.work.WorkManager.getInstance(context).cancelUniqueWork("kanakku-review-reminder")
      synchronized(HistoryImport.guard){HistoryImport.prefs(context).edit().clear().commit();Vault(context).reset();MerchantLookup.reset(context)}
      val prefs=context.getSharedPreferences("kanakku-settings",Context.MODE_PRIVATE);prefs.edit().putBoolean("reviewReminder",false).apply()
      context.stopService(Intent(context,AvatarService::class.java));context.getSystemService(android.app.NotificationManager::class.java).cancelAll()
    }
    AsyncFunction("pending") { Vault(context).pending() }
    AsyncFunction("acknowledge") { ids: List<String> -> Vault(context).acknowledge(ids) }
    AsyncFunction("setCapture") { enabled:Boolean -> if(enabled) check(Vault(context).ready()) {"Unlock first"}; Vault(context).setEnabled(enabled) }.runOnQueue(Queues.MAIN)
    AsyncFunction("importHistory") { months:Int -> HistoryImport.start(context, months); HistoryImport.status(context) }
    AsyncFunction("importStatus") { HistoryImport.status(context) }
    AsyncFunction("reconcileHistory") { HistoryImport.reconcile(context); HistoryImport.status(context) }
    AsyncFunction("pauseImport") { HistoryImport.pause(context); HistoryImport.status(context) }
    AsyncFunction("resumeImport") { HistoryImport.resume(context); HistoryImport.status(context) }
    AsyncFunction("previewFloatingPrompt") { Prompts.preview(context) }
    AsyncFunction("overlaySettings") { context.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    AsyncFunction("tapSound") {
      val audio=context.getSystemService(AudioManager::class.java)
      val enabled=context.getSharedPreferences("kanakku-settings",Context.MODE_PRIVATE).getBoolean("sounds",true)
      if(enabled && audio.ringerMode==AudioManager.RINGER_MODE_NORMAL) { val tone=ToneGenerator(AudioManager.STREAM_NOTIFICATION,18);tone.startTone(ToneGenerator.TONE_PROP_BEEP,35);Handler(Looper.getMainLooper()).postDelayed({tone.release()},100) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("setPreferences") { overlay:Boolean, dark:Boolean, sounds:Boolean -> context.getSharedPreferences("kanakku-settings",Context.MODE_PRIVATE).edit().putBoolean("sounds",sounds).putBoolean("overlay",overlay).putString("theme",if(dark) "dark" else "light").apply() }
    AsyncFunction("listen") { promise:Promise ->
      if(speechPromise!=null) {promise.reject("BUSY","A voice session is already active",null);return@AsyncFunction}
      if(!SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {promise.reject("VOICE_UNAVAILABLE","Offline speech recognition is not available on this phone. Type a note instead.",null);return@AsyncFunction}
      if(ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) {promise.reject("MIC_PERMISSION","Microphone permission is required",null);return@AsyncFunction}
      speechPromise=promise
      speech=SpeechRecognizer.createOnDeviceSpeechRecognizer(context).apply {
        setRecognitionListener(object:RecognitionListener {
          override fun onReadyForSpeech(params:Bundle?) {}
          override fun onBeginningOfSpeech() {}
          override fun onRmsChanged(rmsdB:Float) {}
          override fun onBufferReceived(buffer:ByteArray?) {}
          override fun onEndOfSpeech() {}
          override fun onPartialResults(results:Bundle?) {}
          override fun onEvent(type:Int,params:Bundle?) {}
          override fun onError(error:Int) { speechPromise?.reject("VOICE_FAILED","Couldn't hear a complete phrase. Try again or type a note.",null);speechPromise=null;speech?.destroy();speech=null }
          override fun onResults(results:Bundle?) { val text=results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull(); if(text.isNullOrBlank()) speechPromise?.reject("VOICE_EMPTY","No speech recognized. Try again.",null) else speechPromise?.resolve(text);speechPromise=null;speech?.destroy();speech=null }
        })
        startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM).putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE,true).putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,1))
      }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("cancelListening") { pcmRecorder.cancel();speech?.cancel();speech?.destroy();speech=null;speechPromise?.reject("CANCELLED","Recording stopped",null);speechPromise=null }.runOnQueue(Queues.MAIN)
  }
  companion object {
    const val TEST_PACKAGE="app.tinkerbox.kanakku.e2e"
    /** Keep Android screenshots and screen recordings available while the unlocked journal is open. */
    fun allowScreenshots(activity:android.app.Activity) {
      activity.window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
    }
    @Volatile var foreground=false
    private var instance:WeakReference<KanakkuModule>?=null
    fun notifyArrival() { instance?.get()?.sendEvent("onTransaction",emptyMap<String,Any>()) }
    fun notifyImport() { instance?.get()?.sendEvent("onImportProgress",emptyMap<String,Any>()) }
  }
}
