package expo.modules.kanakku

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/** The bundled Whisper model chosen with npm run voice:model (assets/kanakku/voice-model.json). */
object VoiceModels {
  data class Bundled(val asset: String, val sha256: String, val languages: List<String>)

  fun bundled(context: Context): Bundled {
    val j = JSONObject(context.assets.open("kanakku/voice-model.json").bufferedReader().use { it.readText() })
    val languages = j.getJSONArray("languages").let { a -> List(a.length()) { a.getString(it) } }
    return Bundled(j.getString("asset"), j.getString("sha256"), languages)
  }

  /** Verified private copy, made once per model; whisper.cpp then reads a plain file. */
  @Synchronized fun path(context: Context, asset: String, sha256: String): String {
    require(Regex("^whisper-[A-Za-z0-9._-]+\\.bin$").matches(asset) && Regex("^[0-9a-f]{64}$").matches(sha256)) { "Unexpected voice model." }
    val dir = File(context.noBackupFilesDir, "voice-models").apply { mkdirs() }
    val target = File(dir, asset)
    val marker = File(dir, "$asset.sha256")
    if (!(target.isFile && marker.isFile && marker.readText() == sha256)) {
      dir.listFiles()?.forEach { it.delete() }
      val partial = File(dir, "$asset.partial")
      val digest = MessageDigest.getInstance("SHA-256")
      context.assets.open("kanakku/$asset").use { input -> partial.outputStream().use { out ->
        val buffer = ByteArray(1 shl 20)
        while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count); out.write(buffer, 0, count) }
      } }
      if (digest.digest().joinToString("") { "%02x".format(it) } != sha256) { partial.delete(); throw IllegalStateException("The bundled voice model failed its integrity check.") }
      check(partial.renameTo(target)) { "Could not prepare the voice model." }
      marker.writeText(sha256)
    }
    return target.absolutePath
  }

  fun dir(context: Context) = File(context.noBackupFilesDir, "voice-models").path
}
