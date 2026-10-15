package expo.modules.kanakku

import android.content.Context
import ai.onnxruntime.*
import org.json.JSONArray
import java.security.MessageDigest
import kotlin.math.sqrt

data class SemanticSuggestion(val category:String, val similarity:Double, val margin:Double)
object SemanticClassifier {
  private var session:OrtSession?=null
  private var tokenizer:WordPiece?=null
  private var prototypes:List<Pair<String,FloatArray>> = emptyList()
  private val environment by lazy { OrtEnvironment.getEnvironment() }
  private fun initialize(context:Context) {
    if(session!=null)return
    val bytes=context.assets.open("kanakku/minilm.onnx").use{it.readBytes()}
    val hash=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)}
    check(hash=="4278337fd0ff3c68bfb6291042cad8ab363e1d9fbc43dcb499fe91c871902474") {"Model integrity check failed"}
    val vocab=context.assets.open("kanakku/vocab.txt").bufferedReader().use{it.readLines()}.withIndex().associate{it.value to it.index}
    val rows=JSONArray(context.assets.open("kanakku/prototypes.json").bufferedReader().use{it.readText()})
    val parsed=(0 until rows.length()).map { i -> val row=rows.getJSONObject(i);val vector=row.getJSONArray("embedding");row.getString("category") to FloatArray(vector.length()){vector.getDouble(it).toFloat()} }
    OrtSession.SessionOptions().use { options -> options.setIntraOpNumThreads(2);session=environment.createSession(bytes,options) }
    tokenizer=WordPiece(vocab);prototypes=parsed
  }
  @Synchronized fun suggest(context:Context,text:String):SemanticSuggestion {
    if(text.isBlank())return SemanticSuggestion("Uncategorized",0.0,0.0)
    initialize(context)
    val ids=tokenizer!!.encode(text.take(300));val tokens=mutableMapOf<String,OnnxTensor>()
    try {
      tokens["input_ids"]=OnnxTensor.createTensor(environment,arrayOf(ids))
      tokens["attention_mask"]=OnnxTensor.createTensor(environment,arrayOf(LongArray(ids.size){1}))
      if(session!!.inputNames.contains("token_type_ids"))tokens["token_type_ids"]=OnnxTensor.createTensor(environment,arrayOf(LongArray(ids.size)))
      session!!.run(tokens).use{outputs ->
        @Suppress("UNCHECKED_CAST") val hidden=outputs[0].value as Array<Array<FloatArray>>
        val vector=FloatArray(hidden[0][0].size)
        for(token in hidden[0])for(i in vector.indices)vector[i]+=token[i]/hidden[0].size
        val norm=sqrt(vector.sumOf{it.toDouble()*it}).coerceAtLeast(1e-12)
        val scores=mutableMapOf<String,Double>()
        for((category,prototype) in prototypes) {
          val score=vector.indices.sumOf { vector[it]/norm*prototype[it] }
          scores[category]=maxOf(scores[category] ?: -1.0,score)
        }
        val ranked=scores.entries.sortedByDescending{it.value};val best=ranked.first();val margin=best.value-ranked[1].value
        return SemanticSuggestion(best.key,best.value,margin)
      }
    }finally{tokens.values.forEach{it.close()}}
  }
  fun enrich(context:Context,t:ParsedTransaction):ParsedTransaction {
    if(t.kind!="purchase")return t
    PersonalRules.lookup(context,t.merchant)?.let{return t.copy(category=it,review=false,method="rule",classifierVersion="personal-rules-v1")}
    if(!t.review)return t
    // Similarity thresholds are conservative routing heuristics, not probability calibration.
    return runCatching { val s=suggest(context,t.merchant);if(s.similarity>=.58&&s.margin>=.15)t.copy(category=s.category,review=false,method="model",classifierVersion="minilm-l6-v2-qint8-4278337f-prototypes-v1",score=s.similarity,margin=s.margin) else t.copy(method="unknown",classifierVersion="minilm-l6-v2-qint8-4278337f-prototypes-v1",score=s.similarity,margin=s.margin) }.getOrDefault(t.copy(method="unknown"))
  }
}
