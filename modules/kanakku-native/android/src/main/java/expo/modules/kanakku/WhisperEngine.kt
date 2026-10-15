package expo.modules.kanakku

import java.io.File

/** Offline whisper.cpp recognition (src/main/cpp). One transcription at a time. */
object WhisperEngine {
  data class Result(val text: String, val language: String, val aborted: Boolean)
  @Volatile private var loaded = false
  private val decodeLock = Any()
  private val cancellation = java.util.concurrent.atomic.AtomicLong(0)

  /** The library uses ARMv8.2 fp16 and dot-product instructions; never load it elsewhere. */
  val supported: Boolean by lazy {
    runCatching {
      val features = File("/proc/cpuinfo").readLines().filter { it.startsWith("Features") }.joinToString(" ")
      " asimdhp" in " $features" && " asimddp" in " $features"
    }.getOrDefault(false)
  }

  @Synchronized private fun load() {
    check(supported) { "Offline voice needs a newer phone processor. Type your answer instead." }
    if (!loaded) { System.loadLibrary("kanakku_whisper"); loaded = true }
  }

  fun transcribe(model: String, pcm: ShortArray, threads: Int, language: String, translate: Boolean, prompt: String?): Result {
    val ticket = cancellation.get()
    return synchronized(decodeLock) {
      // A queued request cancelled while another entry point was decoding must not restart it.
      if (ticket != cancellation.get()) return@synchronized Result("", "", true)
      load()
      nativeReset()
      if (ticket != cancellation.get()) return@synchronized Result("", "", true)
      val out = nativeTranscribe(model, pcm, threads, language, translate, prompt)
      Result(out[0], out[1], out[2] != "ok" || ticket != cancellation.get())
    }
  }

  fun abort() { cancellation.incrementAndGet(); if (loaded) nativeAbort() }

  private external fun nativeTranscribe(model: String, pcm: ShortArray, threads: Int, language: String, translate: Boolean, prompt: String?): Array<String>
  private external fun nativeAbort()
  private external fun nativeReset()
}
