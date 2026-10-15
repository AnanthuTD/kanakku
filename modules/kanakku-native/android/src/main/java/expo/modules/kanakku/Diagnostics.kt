package expo.modules.kanakku

import android.content.Context
import android.os.Build
import org.json.JSONObject
import java.io.File

/**
 * Beta diagnostics: a small local JSON-lines log of errors and pipeline events for
 * debugging over ADB. On by default during the beta and switchable in Settings.
 * Never records SMS text, transcripts, merchant names, account or phone numbers,
 * audio or keys; only fixed event names, enum labels and structural counters are accepted.
 */
object Diagnostics {
  private const val MAX_BYTES = 1_000_000L
  private var app: Context? = null
  private var crashHook = false

  fun install(context: Context) {
    app = context.applicationContext
    if (crashHook) return
    crashHook = true
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      runCatching { log("fatal", "native", "uncaught", emptyMap(), error) }
      previous?.uncaughtException(thread, error)
    }
  }

  fun enabled(context: Context) =
    context.getSharedPreferences("kanakku-settings", Context.MODE_PRIVATE).getBoolean("diagnostics", true)

  @Synchronized fun setEnabled(context: Context, value: Boolean) {
    context.getSharedPreferences("kanakku-settings", Context.MODE_PRIVATE).edit().putBoolean("diagnostics", value).apply()
    if (!value) clear(context)
  }

  fun dir(context: Context): File? = context.getExternalFilesDir("diagnostics")

  @Synchronized fun clear(context: Context) { dir(context)?.listFiles()?.forEach { it.delete() } }

  fun log(level: String, source: String, event: String, detail: Map<String, Any?> = emptyMap(), error: Throwable? = null) {
    val context = app ?: return
    if (!enabled(context) || level !in setOf("info", "warn", "error", "fatal") || !DiagnosticPrivacy.allows(source, event)) return
    runCatching {
      val line = JSONObject()
        .put("t", System.currentTimeMillis())
        .put("level", level)
        .put("source", source)
        .put("event", event)
        .put("build", if (context.packageName == KanakkuModule.TEST_PACKAGE) "test" else "personal")
        .put("version", runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull())
        .put("android", Build.VERSION.SDK_INT)
      val details = JSONObject()
      DiagnosticPrivacy.details(detail).forEach { (key, value) -> details.put(key, value) }
      line.put("detail", details)
      error?.let {
        // Exception messages, stacks and arbitrary class names can contain user data.
        line.put("error", when (it) {
          is SecurityException -> "SecurityException"
          is IllegalArgumentException -> "IllegalArgumentException"
          is IllegalStateException -> "IllegalStateException"
          is java.io.IOException -> "IOException"
          else -> "Exception"
        })
      }
      synchronized(this) {
        if (!enabled(context)) return
        val folder = dir(context) ?: return
        folder.mkdirs()
        val file = File(folder, "kanakku-diagnostics.jsonl")
        if (file.length() > MAX_BYTES) file.renameTo(File(folder, "kanakku-diagnostics.1.jsonl"))
        file.appendText(line.toString() + "\n")
      }
    }
  }
}
