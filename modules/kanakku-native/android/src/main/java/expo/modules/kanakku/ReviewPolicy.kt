package expo.modules.kanakku

object ReviewPolicy {
  fun quiet(minute: Int, start: Int, end: Int): Boolean =
    if (start == end) false else if (start < end) minute >= start && minute < end else minute >= start || minute < end
}
