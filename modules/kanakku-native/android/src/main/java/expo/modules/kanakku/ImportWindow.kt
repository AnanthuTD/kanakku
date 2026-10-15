package expo.modules.kanakku

import java.util.Calendar

object ImportWindow {
  val choices = setOf(0, 1, 3, 4, 6, 12)
  fun since(months: Int, now: Long): Long {
    require(months in choices) { "Choose a supported history period." }
    if (months == 0) return 0L
    return Calendar.getInstance().apply { timeInMillis = now; add(Calendar.MONTH, -months) }.timeInMillis
  }
  fun afterCheckpoint(date: Long, id: Long, lastDate: Long, lastId: Long) =
    date < lastDate || (date == lastDate && id < lastId)
  fun backfillSince(floor:Long,checkpoint:Long) = maxOf(floor,(checkpoint-60000).coerceAtLeast(0))
  fun coverageSince(oldSince:Long,oldUntil:Long,since:Long):Long = if(oldSince>=0 && since<=oldUntil) minOf(oldSince,since) else since
}
