package expo.modules.kanakku
import java.text.Normalizer
import java.util.Locale
class WordPiece(private val vocab:Map<String,Int>) {
  fun encode(input:String):LongArray {
    val text=Normalizer.normalize(input.lowercase(Locale.ROOT),Normalizer.Form.NFD).replace(Regex("\\p{M}+"),"")
    val ids=mutableListOf(vocab.getValue("[CLS]").toLong())
    for(token in Regex("[\\p{L}\\p{N}_]+|[^\\s\\p{L}\\p{N}_]").findAll(text).map{it.value}) {
      if(ids.size>=63)break
      if(token.length>100){ids.add(vocab.getValue("[UNK]").toLong());continue}
      val pieces=mutableListOf<Long>();var start=0
      while(start<token.length) {
        var end=token.length;var found:Int?=null
        while(end>start) { val part=(if(start==0) "" else "##")+token.substring(start,end);found=vocab[part];if(found!=null)break;end-- }
        if(found==null){pieces.clear();pieces.add(vocab.getValue("[UNK]").toLong());break}
        pieces.add(found.toLong());start=end
      }
      ids.addAll(pieces)
    }
    return (ids.take(63)+vocab.getValue("[SEP]").toLong()).toLongArray()
  }
}
