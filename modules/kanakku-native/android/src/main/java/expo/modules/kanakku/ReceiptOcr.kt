package expo.modules.kanakku

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.Rect
import android.media.ExifInterface
import android.net.Uri
import android.os.Looper
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File
import java.util.concurrent.TimeUnit
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean

/** On-device, bundled Latin OCR. Neither the photo, URI nor its text is logged or retained. */
internal object ReceiptOcr {
  private const val MAX_BYTES = 20L * 1024 * 1024
  private const val MAX_PIXELS = 80_000_000L
  private const val MAX_SIDE = 2560
  private const val MAX_TEXT = 24_000
  private val running = AtomicBoolean(false)

  /** Run on the Expo async worker, never Android's UI thread. Caller gates foreground/unlock. */
  fun recognize(context: Context, value: String): String {
    check(Looper.myLooper() != Looper.getMainLooper()) { "Bill reading needs a background worker." }
    check(running.compareAndSet(false, true)) { "The previous bill is still being read. Please try again in a moment." }
    var decoded: Bitmap? = null
    var image: Bitmap? = null
    var recognizer: TextRecognizer? = null
    var task: Task<Text>? = null
    try {
      val file = cacheImage(context, value)
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(file.path, bounds)
      require(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth.toLong() * bounds.outHeight <= MAX_PIXELS) {
        "This photo is too large or is not a supported image. Try a smaller photo."
      }
      require(bounds.outMimeType in setOf("image/jpeg", "image/png", "image/webp")) { "Choose a JPEG, PNG or WebP bill photo." }
      var sample = 1
      while (maxOf(bounds.outWidth, bounds.outHeight) / sample > MAX_SIDE) sample *= 2
      val bitmap = BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply {
        inSampleSize = sample
        inPreferredConfig = Bitmap.Config.ARGB_8888
      }) ?: throw IllegalArgumentException("The bill photo could not be opened. Try another photo.")
      decoded = bitmap
      val oriented = orient(bitmap, file)
      image = oriented
      val reader = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      recognizer = reader
      val operation = reader.process(InputImage.fromBitmap(oriented, 0))
      task = operation
      val result = Tasks.await(operation, 20, TimeUnit.SECONDS)
      // One extra character/row lets the domain layer flag truncation instead of hiding it.
      return readingOrder(result).take(MAX_TEXT + 1)
    } finally {
      val cleanup = {
        try { recognizer?.close() }
        finally {
          if (image !== decoded) image?.recycle()
          decoded?.recycle()
          running.set(false)
        }
      }
      // A deadline stops awaiting; it does not cancel ML Kit's use of the pixels. Release only
      // after its actual task settles, and refuse a second decode while that cleanup is pending.
      val pending = task
      if (pending != null && !pending.isComplete) {
        val once = AtomicBoolean(false)
        pending.addOnCompleteListener(Executor { it.run() }) { if (once.compareAndSet(false, true)) cleanup() }
        // Watchdog: ML Kit normally settles within seconds of the deadline; never stay stuck.
        Thread { Thread.sleep(30_000); if (once.compareAndSet(false, true)) cleanup() }.apply { isDaemon = true; name = "kanakku-ocr-watchdog"; start() }
      } else cleanup()
    }
  }

  private fun cacheImage(context: Context, value: String): File {
    require(value.length in 1..2048) { "Choose a bill photo from this app." }
    val uri = Uri.parse(value)
    // The picker returns an app-cache copy. Never permit arbitrary content providers, network URLs,
    // ledger/databases, Keystore envelopes or another app's private/external files.
    require(uri.scheme == "file" && uri.authority.isNullOrEmpty() && uri.query == null && uri.fragment == null) {
      "Choose a bill photo from this app."
    }
    val cache = context.cacheDir.canonicalFile
    val file = File(requireNotNull(uri.path)).canonicalFile
    require(file.path.startsWith(cache.path + File.separator) && file.isFile && file.canRead() && file.length() in 1..MAX_BYTES) {
      "The bill photo is unavailable or too large. Please take it again."
    }
    return file
  }

  private fun orient(bitmap: Bitmap, file: File): Bitmap {
    val orientation = try { ExifInterface(file.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
    catch (_: Exception) { ExifInterface.ORIENTATION_NORMAL }
    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.setScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.setRotate(90f); matrix.postScale(-1f, 1f) }
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
      ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.setRotate(270f); matrix.postScale(-1f, 1f) }
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(270f)
      else -> return bitmap
    }
    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
  }

  /** ML Kit may put a right-hand price column in a separate block. Rejoin aligned physical rows. */
  private fun readingOrder(text: Text): String {
    data class Row(val bounds: Rect, val parts: MutableList<Text.Line>)
    val lines = text.textBlocks.flatMap { it.lines }.filter { it.boundingBox != null }.sortedBy { it.boundingBox!!.centerY() }
    val rows = mutableListOf<Row>()
    for (line in lines.take(800)) {
      val box = line.boundingBox!!
      val row = rows.lastOrNull()?.takeIf {
        kotlin.math.abs(it.bounds.centerY() - box.centerY()) <= maxOf(2, minOf(it.bounds.height(), box.height()) / 2)
      }
      if (row == null) rows += Row(Rect(box), mutableListOf(line))
      else { row.parts += line; row.bounds.union(box) }
    }
    return rows.take(401).joinToString("\n") { row ->
      row.parts.sortedBy { it.boundingBox!!.left }.joinToString("  ") { it.text }
    }
  }
}
