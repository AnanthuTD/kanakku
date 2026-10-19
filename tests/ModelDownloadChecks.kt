import expo.modules.kanakku.ModelFiles
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.file.Files
import java.security.MessageDigest

fun modelDownloadChecks():Int {
  var checks=0
  fun verify(ok:Boolean){checks++;check(ok){"Model download check $checks failed"}}
  val bytes="Pinned model bytes".toByteArray()
  val sha=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)}
  val dir=Files.createTempDirectory("kanakku-model-checks").toFile()
  try {
    val file=java.io.File(dir,"model")
    verify(!ModelFiles.verified(file,bytes.size.toLong(),sha))
    file.writeBytes(bytes);verify(ModelFiles.verified(file,bytes.size.toLong(),sha))
    file.writeText("Corrupt same bytes");verify(!ModelFiles.verified(file,bytes.size.toLong(),sha))
    file.writeBytes(bytes.copyOf(bytes.size-1));verify(!ModelFiles.verified(file,bytes.size.toLong(),sha))
    val output=ByteArrayOutputStream()
    verify(ModelFiles.copy(ByteArrayInputStream(bytes),output,0,bytes.size.toLong(),{true},{})==bytes.size.toLong())
    verify(output.toByteArray().contentEquals(bytes))
    val resumed=ByteArrayOutputStream().apply{write(bytes,0,4)}
    ModelFiles.copy(ByteArrayInputStream(bytes.copyOfRange(4,bytes.size)),resumed,4,bytes.size.toLong(),{true},{})
    verify(resumed.toByteArray().contentEquals(bytes))
    verify(runCatching{ModelFiles.copy(ByteArrayInputStream(bytes),ByteArrayOutputStream(),0,bytes.size-1L,{true},{})}.isFailure)
    verify(runCatching{ModelFiles.copy(ByteArrayInputStream(bytes),ByteArrayOutputStream(),0,bytes.size+1L,{true},{})}.isFailure)
    verify(runCatching{ModelFiles.copy(ByteArrayInputStream(bytes),ByteArrayOutputStream(),0,bytes.size.toLong(),{false},{})}.isFailure)
    var current=true
    verify(runCatching{ModelFiles.copy(ByteArrayInputStream(bytes),ByteArrayOutputStream(),0,bytes.size.toLong(),{current},{current=false})}.isFailure)
    verify(ModelFiles.resumeOffset(200,null,4,18)==0L)
    verify(ModelFiles.resumeOffset(206,"bytes 4-17/18",4,18)==4L)
    for(range in listOf("bytes 0-17/18","bytes 4-16/18","bytes 4-17/19",null))
      verify(runCatching{ModelFiles.resumeOffset(206,range,4,18)}.isFailure)
    verify(runCatching{ModelFiles.resumeOffset(206,"bytes 0-17/18",0,18)}.isFailure)
    verify(runCatching{ModelFiles.resumeOffset(500,null,4,18)}.isFailure)
  }finally{dir.deleteRecursively()}
  return checks
}
