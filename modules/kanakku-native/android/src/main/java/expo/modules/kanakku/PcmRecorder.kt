package expo.modules.kanakku

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.SystemClock
import expo.modules.kotlin.Promise
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.sqrt

/** A short, foreground-only clip held in memory. Never creates an audio file. */
class PcmRecorder {
  private val running=AtomicBoolean(false)
  private val capturing=AtomicBoolean(false)
  @Volatile private var audio:AudioRecord?=null
  @Volatile private var cancelled=false
  // The finished clip stays in native memory for WhisperEngine; JS only learns its length.
  private var clip:ShortArray?=null
  @Synchronized fun takeClip():ShortArray? { val taken=clip; clip=null; return taken }
  @Synchronized private fun keep(samples:ShortArray) { clip?.fill(0); clip=samples }
  @Synchronized fun clearClip() { clip?.fill(0); clip=null }
  /** Outcome codes: VOICE_BUSY, VOICE_CANCELLED, VOICE_SILENT_INPUT (Android withheld the mic), VOICE_RECORDING_FAILED. */
  fun interface Done { fun done(samples:Int?, code:String?, message:String?) }
  fun start(promise:Promise, testDiagnostics:Boolean=false, debugClips:java.io.File?=null) =
    record(testDiagnostics,debugClips) { samples,code,message -> if(samples!=null)promise.resolve(samples) else promise.reject(code ?: "VOICE_RECORDING_FAILED",message,null) }
  @Synchronized fun record(testDiagnostics:Boolean=false, debugClips:java.io.File?=null, done:Done) {
    if(!running.compareAndSet(false,true)){done.done(null,"VOICE_BUSY","A voice session is already active.");return}
    cancelled=false
    capturing.set(true)
    Thread {
      var recorder:AudioRecord?=null
      val pcm=ByteArrayOutputStream()
      try {
        val minimum=AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT)
        check(minimum>0){"This microphone does not support offline recording."}
        recorder=AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
          .setAudioFormat(AudioFormat.Builder().setSampleRate(16000).setChannelMask(AudioFormat.CHANNEL_IN_MONO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build()).setBufferSizeInBytes(maxOf(minimum*2,6400)).build()
        check(recorder.state==AudioRecord.STATE_INITIALIZED){"Could not open the microphone."}
        audio=recorder
        if(!capturing.get())throw IllegalStateException("Voice session cancelled")
        recorder.startRecording()
        val started=SystemClock.elapsedRealtime();var lastSpeech=started;var spoken=false;var maxRms=0.0;var capturedFrames=0;var firstSpeech=-1L;var speechWindows=0;var longestGap=0L;var quietSince=-1L
        val samples=ShortArray(320)
        // Room noise often sits near a fixed threshold, so speech must clearly exceed the
        // measured floor (20th percentile of non-silent 20 ms windows heard so far).
        val levels=ArrayList<Double>();var floor=0.0;var threshold=250.0;var speechEndBytes=0
        while(capturing.get()&&SystemClock.elapsedRealtime()-started<15000) {
          val count=recorder.read(samples,0,samples.size)
          if(count<=0){if(!capturing.get())break;throw IllegalStateException("Microphone became unavailable")}
          val rms=sqrt((0 until count).sumOf{samples[it].toDouble()*samples[it]}/count)
          maxRms=maxOf(maxRms,rms);capturedFrames+=count
          val now=SystemClock.elapsedRealtime()
          if(rms>1.0){levels.add(rms);if(levels.size>=10&&levels.size%5==0){floor=levels.sorted()[levels.size/5];threshold=maxOf(250.0,2.5*floor)}}
          for(i in 0 until count){pcm.write(samples[i].toInt() and 255);pcm.write((samples[i].toInt() shr 8) and 255)}
          if(rms>threshold){if(!spoken)firstSpeech=now-started;spoken=true;lastSpeech=now;speechEndBytes=pcm.size();speechWindows++;if(quietSince>=0)longestGap=maxOf(longestGap,now-quietSince);quietSince=-1}
          else if(spoken&&quietSince<0)quietSince=now
          // Natural pauses inside a sentence can approach a second; 1.6 s of quiet ends it.
          if(spoken&&now-lastSpeech>1600&&now-started>2000)break
          if(!spoken&&now-started>6000)break
        }
        // Test-only numeric signal diagnostics contain no audio or transcript.
        if(testDiagnostics)android.util.Log.i("KanakkuVoiceTest","frames=$capturedFrames maxRms=${maxRms.toInt()} spoken=$spoken firstSpeechMs=$firstSpeech lastSpeechMs=${if(spoken)lastSpeech-started else -1} endMs=${SystemClock.elapsedRealtime()-started} speechWindows=$speechWindows longestGapMs=$longestGap floor=${floor.toInt()} threshold=${threshold.toInt()}")
        if(cancelled)throw IllegalStateException("Voice session cancelled")
        // Background apps receive digital silence instead of an error.
        if(maxRms<2.0&&capturedFrames>8000)throw SilentInput()
        check(spoken&&pcm.size()>6400){"No clear speech detected. Try again or type a note."}
        // Mono 16 kHz signed 16-bit PCM for WhisperEngine.
        val all=pcm.toByteArray()
        debugClips?.let { saveDebugClip(it,all) }
        // Drop the trailing room noise after the last speech (keep 0.4 s).
        val raw=all.copyOf(minOf(all.size,speechEndBytes+12800))
        all.fill(0)
        val gain=normalize(raw)
        if(testDiagnostics)android.util.Log.i("KanakkuVoiceTest","gain=${"%.2f".format(gain)}")
        val clipSamples=ShortArray(raw.size/2){i->((raw[2*i+1].toInt() shl 8) or (raw[2*i].toInt() and 255)).toShort()}
        raw.fill(0)
        keep(clipSamples)
        done.done(clipSamples.size,null,null)
      }catch(e:Exception){if(testDiagnostics)android.util.Log.w("KanakkuVoiceTest","recording failed: ${e.javaClass.simpleName}")
        when {
          cancelled -> done.done(null,"VOICE_CANCELLED","Recording cancelled")
          e is SilentInput -> done.done(null,"VOICE_SILENT_INPUT","Android did not provide microphone audio.")
          else -> done.done(null,"VOICE_RECORDING_FAILED",e.message)
        }}
      finally{capturing.set(false);audio=null;runCatching{recorder?.stop()};recorder?.release();pcm.reset();pcm.close();running.set(false)}
    }.apply{name="kanakku-voice-clip";start()}
  }
  private class SilentInput : Exception()
  fun finish(){capturing.set(false);runCatching{audio?.stop()}}
  /** Quiet voices reach VOICE_RECOGNITION without AGC; lift the clip toward 70% peak, at most 8x. */
  private fun normalize(raw:ByteArray):Float {
    var peak=1
    for(i in 0 until raw.size-1 step 2){val v=((raw[i+1].toInt() shl 8) or (raw[i].toInt() and 255)).toShort().toInt();peak=maxOf(peak,kotlin.math.abs(v))}
    val gain=minOf(8f,0.7f*32767f/peak)
    if(gain<=1.05f)return 1f
    for(i in 0 until raw.size-1 step 2){
      val v=((raw[i+1].toInt() shl 8) or (raw[i].toInt() and 255)).toShort().toInt()
      val out=(v*gain).toInt().coerceIn(-32768,32767)
      raw[i]=(out and 255).toByte();raw[i+1]=((out shr 8) and 255).toByte()
    }
    return gain
  }
  /** Test package only, user opt-in: keep the three most recent raw clips as WAV for diagnosis. */
  private fun saveDebugClip(dir:java.io.File,raw:ByteArray){
    runCatching {
      dir.mkdirs()
      val files=(dir.listFiles{f->f.name.endsWith(".wav")}?:emptyArray()).sortedBy{it.lastModified()}
      files.dropLast(2).forEach{it.delete();java.io.File(it.path.removeSuffix(".wav")+".txt").delete()}
      val header=java.nio.ByteBuffer.allocate(44).order(java.nio.ByteOrder.LITTLE_ENDIAN).apply{
        put("RIFF".toByteArray());putInt(36+raw.size);put("WAVE".toByteArray());put("fmt ".toByteArray())
        putInt(16);putShort(1);putShort(1);putInt(16000);putInt(32000);putShort(2);putShort(16)
        put("data".toByteArray());putInt(raw.size)
      }
      java.io.File(dir,"clip-${System.currentTimeMillis()}.wav").outputStream().use{it.write(header.array());it.write(raw)}
    }
  }
  fun cancel(){cancelled=true;finish();clearClip()}
}
