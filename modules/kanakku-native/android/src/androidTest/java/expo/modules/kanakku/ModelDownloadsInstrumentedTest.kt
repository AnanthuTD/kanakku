package expo.modules.kanakku

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID

/** Run only on the isolated AVD/library test package. Real pinned HTTP downloads, no user inputs. */
@RunWith(AndroidJUnit4::class)
class ModelDownloadsInstrumentedTest {
  private val context get() = InstrumentationRegistry.getInstrumentation().targetContext.also {
    check(it.packageName.startsWith("expo.modules.kanakku")) { "Never run against a personal journal" }
  }
  private fun row(id:String)=ModelDownloads.status(context).single{it["id"]==id}
  private fun waitReady(id:String) {
    val deadline=System.currentTimeMillis()+240_000
    while(System.currentTimeMillis()<deadline) {
      val state=row(id)["state"]
      if(state=="ready")return
      check(state!="error") { "Real download failed for $id" }
      Thread.sleep(500)
    }
    error("Model download timed out for $id")
  }
  @Test fun downloadAndVerifyRealModels() {
    for(id in listOf("voice","categories")) {
      if(id=="categories")SemanticClassifier.removeModel(context) else ModelDownloads.remove(context,id)
      val s=ModelDownloads.spec(context,id)
      assertThrows(java.io.FileNotFoundException::class.java) { context.assets.open("kanakku/${s.asset}").close() }
      assertEquals("missing",row(id)["state"])
      assertThrows(IllegalStateException::class.java) { ModelDownloads.withModel(context,id) { } }
    }
    val t=SmsParser.parse("AD-HDFCBK","Rs.250 spent on HDFC Bank Card xx4821 at UNIDENTIFIED MERCHANT on 16-Oct. Ref 612345678901",System.currentTimeMillis())!!
    val enriched=SemanticClassifier.enrich(context,t)
    assertEquals(t.amount,enriched.amount);assertTrue(enriched.review)
    assertEquals("missing",row("categories")["state"])
    // Cancelling invalidates work before it can publish an installed model.
    ModelDownloads.start(context,"categories");ModelDownloads.cancel(context,"categories")
    assertEquals("missing",row("categories")["state"])
    val cancelledToken=UUID.randomUUID().toString()
    val cancelledPart=File(ModelDownloads.dir(context),"categories-$cancelledToken.partial")
    context.getSharedPreferences("kanakku-model-downloads",Context.MODE_PRIVATE).edit().putString("categories.token",cancelledToken).commit()
    assertThrows(IllegalStateException::class.java) {
      ModelDownloads.download(context,"categories",cancelledToken){cancelledPart.length()==0L}
    }
    assertFalse("Cancelled network copy must discard its partial file",cancelledPart.exists())
    ModelDownloads.cancel(context,"categories")
    for(id in listOf("categories","voice")) {
      ModelDownloads.start(context,id);waitReady(id)
      val s=ModelDownloads.spec(context,id)
      ModelDownloads.withModel(context,id) { assertTrue(ModelFiles.verified(File(it),s.bytes,s.sha256)) }
      val before=ModelDownloads.withModel(context,id) { File(it).lastModified() }
      ModelDownloads.start(context,id)
      assertEquals(before,ModelDownloads.withModel(context,id) { File(it).lastModified() })
    }
    val suggestion=SemanticClassifier.suggest(context,"Taxi ride to office")
    assertEquals("Transport",suggestion.category);assertTrue(suggestion.similarity.isFinite())
  }
  @Test fun reuseAfterProcessRestartAndResumePartialDownload() {
    for(id in listOf("voice","categories"))assertEquals("ready",row(id)["state"])
    val id="categories";val s=ModelDownloads.spec(context,id)
    val target=File(ModelDownloads.withModel(context,id){it})
    SemanticClassifier.suggest(context,"Taxi ride to office")
    // Simulate a durable checkpoint from a stopped worker using real pinned model bytes.
    val token=UUID.randomUUID().toString();val partial=File(ModelDownloads.dir(context),"$id-$token.partial")
    target.inputStream().use { input -> partial.outputStream().use{out ->
      val buffer=ByteArray(64*1024);var remaining=s.bytes-1024
      while(remaining>0){val n=input.read(buffer,0,minOf(buffer.size.toLong(),remaining).toInt());check(n>0);out.write(buffer,0,n);remaining-=n}
    } }
    SemanticClassifier.removeModel(context)
    context.getSharedPreferences("kanakku-model-downloads",Context.MODE_PRIVATE).edit().putString("$id.token",token).putString("$id.state","waiting").commit()
    ModelDownloads.download(context,id,token){true}
    assertEquals("ready",row(id)["state"])
    ModelDownloads.withModel(context,id){assertTrue(ModelFiles.verified(File(it),s.bytes,s.sha256))}
    assertFalse(partial.exists())
    // Actual inference from the downloaded file; public CC-BY FLEURS fixture, no microphone.
    if(WhisperEngine.supported) {
      val bytes=InstrumentationRegistry.getInstrumentation().context.assets.open("en-natural-taxi.wav").use{it.readBytes()}
      val data=ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
      var pos=12;var pcm:ShortArray?=null
      while(pos+8<=bytes.size) {
        val size=data.getInt(pos+4)
        check(size>=0 && pos+8L+size<=bytes.size)
        if(String(bytes,pos,4,Charsets.US_ASCII)=="data") {
          val audio=ByteBuffer.wrap(bytes,pos+8,size).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
          pcm=ShortArray(audio.remaining()).also{audio.get(it)};break
        }
        pos+=8+size+(size%2)
      }
      val samples=requireNotNull(pcm)
      try {
        val result=ModelDownloads.withModel(context,"voice") { WhisperEngine.transcribe(it,samples,4,"en",false,null) }
        assertFalse(result.aborted)
        assertTrue("Downloaded Whisper should recognize the public taxi sample",Regex("taxi|motorcycle|ride",RegexOption.IGNORE_CASE).containsMatchIn(result.text))
      }finally{samples.fill(0)}
    }
  }
  @Test fun corruptionRemovalAndMissingFallback() {
    val s=ModelDownloads.spec(context,"categories")
    val target=File(ModelDownloads.withModel(context,"categories"){it})
    SemanticClassifier.removeModel(context)
    // Recreate a same-length but invalid file to ensure size alone is never sufficient for inference.
    RandomAccessFile(target,"rw").use{it.setLength(s.bytes)}
    assertThrows(IllegalStateException::class.java){SemanticClassifier.suggest(context,"Taxi ride")}
    assertEquals("error",row("categories")["state"])
    assertFalse(target.exists())
    for(id in listOf("categories","voice")) {
      if(id=="categories")SemanticClassifier.removeModel(context) else ModelDownloads.remove(context,id)
      assertEquals("missing",row(id)["state"])
      assertThrows(IllegalStateException::class.java){ModelDownloads.withModel(context,id){}}
    }
  }
}
