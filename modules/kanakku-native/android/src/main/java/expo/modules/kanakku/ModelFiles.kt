package expo.modules.kanakku

import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest

/** Pure file primitives shared by Android delivery and host regression checks. */
object ModelFiles {
  fun verified(file: File, bytes: Long, sha: String): Boolean {
    if (!file.isFile || file.length() != bytes) return false
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(128 * 1024)
      while (true) { val n=input.read(buffer); if(n<0)break; digest.update(buffer,0,n) }
    }
    return digest.digest().joinToString("") { "%02x".format(it) } == sha
  }
  fun copy(input: InputStream, output: OutputStream, offset: Long, expected: Long, current: () -> Boolean, progress: (Long) -> Unit): Long {
    require(offset in 0..expected)
    var total=offset
    val buffer=ByteArray(128 * 1024)
    while(true) {
      check(current()) { "Download cancelled" }
      val n=input.read(buffer); if(n<0)break
      check(total+n <= expected) { "Model exceeds pinned size" }
      output.write(buffer,0,n); total+=n; progress(total)
    }
    check(current()) { "Download cancelled" }
    check(total==expected) { "Model download incomplete" }
    return total
  }
  fun resumeOffset(code: Int, contentRange: String?, offset: Long, expected: Long): Long {
    if(code==200)return 0
    check(code==206 && offset>0) { "Unexpected download response" }
    val match=Regex("bytes ([0-9]+)-([0-9]+)/([0-9]+)").matchEntire(contentRange.orEmpty())
      ?: error("Invalid partial response")
    check(match.groupValues[1].toLong()==offset && match.groupValues[2].toLong()==expected-1 && match.groupValues[3].toLong()==expected) { "Unexpected partial range" }
    return offset
  }
}
