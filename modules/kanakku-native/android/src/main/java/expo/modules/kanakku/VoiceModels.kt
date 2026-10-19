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

  /** Only a verified, explicitly downloaded model may be used; never initiate network I/O. */
  fun path(context: Context, asset: String, sha256: String): String {
    val selected=bundled(context)
    require(asset==selected.asset && sha256==selected.sha256) { "Unexpected voice model." }
    val spec=ModelDownloads.spec(context,"voice")
    check(spec.asset==asset && spec.sha256==sha256) { "Voice catalog mismatch" }
    return ModelDownloads.withModel(context,"voice"){it}
  }

  fun dir(context: Context) = ModelDownloads.dir(context).path
}
