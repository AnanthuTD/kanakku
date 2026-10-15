package expo.modules.kanakku

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.io.RandomAccessFile
import java.util.UUID
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Real bundled OCR on generated pixels; no provider mocks, cloud service or personal bill. */
@RunWith(AndroidJUnit4::class)
class ReceiptOcrInstrumentedTest {
  private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

  private fun bill(directory: File = context.cacheDir): File {
    val file = File(directory, "synthetic-receipt-${UUID.randomUUID()}.png")
    val bitmap = Bitmap.createBitmap(1000, 1100, Bitmap.Config.ARGB_8888)
    try {
      val canvas = Canvas(bitmap)
      canvas.drawColor(Color.WHITE)
      val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.BLACK; textSize = 36f; typeface = Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)
      }
      listOf("COCONUT MART", "Tax Invoice", "Date: 15/10/2026", "Item Qty Rate Amount", "Milk 2 x 28.00 56.00", "Rice 1 x 120.00 120.00", "Subtotal 176.00", "CGST 2.5% 4.40", "SGST 2.5% 4.40", "Grand Total INR 184.80", "Cash Tendered 200.00", "Change 15.20").forEachIndexed { index, line ->
        canvas.drawText(line, 48f, 85f + index * 65f, paint)
      }
      file.outputStream().use { output -> check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) }
      return file
    } finally { bitmap.recycle() }
  }

  @Test fun recognizesSyntheticBillWithBundledLatinModel() {
    val file = bill()
    try {
      val text = ReceiptOcr.recognize(context, file.toURI().toString())
      assertTrue("Merchant must be recognized from pixels", text.contains("COCONUT MART", ignoreCase = true))
      assertTrue("Item must be recognized from pixels", text.contains("Milk", ignoreCase = true))
      assertTrue("Printed total must be recognized from pixels", text.contains("184.80"))
      assertTrue("Printed subtotal must be recognized from pixels", text.contains("176.00"))
    } finally { file.delete() }
  }

  @Test fun rejectsImagesOutsideOwnCacheIncludingCanonicalTraversal() {
    val file = bill(context.filesDir)
    try {
      assertThrows(IllegalArgumentException::class.java) { ReceiptOcr.recognize(context, file.toURI().toString()) }
      val traversal = "file://${context.cacheDir.absolutePath}/../files/${file.name}"
      assertThrows(IllegalArgumentException::class.java) { ReceiptOcr.recognize(context, traversal) }
    } finally { file.delete() }
  }

  @Test fun rejectsNetworkAndContentUris() {
    for (uri in listOf("https://example.com/receipt.png", "content://example.provider/receipt", "file://foreign-authority/receipt.png")) {
      assertThrows(IllegalArgumentException::class.java) { ReceiptOcr.recognize(context, uri) }
    }
  }

  @Test fun rejectsNonImagesAndOversizedFilesWithoutRecognition() {
    val file = File(context.cacheDir, "synthetic-not-a-photo-${UUID.randomUUID()}.png")
    try {
      file.writeText("SQLite format 3\u0000not an image")
      assertThrows(IllegalArgumentException::class.java) { ReceiptOcr.recognize(context, file.toURI().toString()) }
      RandomAccessFile(file, "rw").use { it.setLength(20L * 1024 * 1024 + 1) }
      assertThrows(IllegalArgumentException::class.java) { ReceiptOcr.recognize(context, file.toURI().toString()) }
    } finally { file.delete() }
  }
}
