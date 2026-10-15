package expo.modules.kanakku

/** Unsaved overlay context: bounded process memory, exact-payment ownership, consumed on handoff. */
internal class CompanionDraftStore(private val now: () -> Long = { System.nanoTime() / 1_000_000 }) {
  data class Draft(val note: String, val category: String?)
  private data class Entry(val draft: Draft, val at: Long)
  private val drafts = linkedMapOf<String, Entry>()
  private val validId = Regex("^[a-f0-9]{64}$")
  private val categories = setOf("Food & dining", "Groceries", "Transport", "Shopping", "Bills & utilities", "Entertainment", "Health", "Home", "Uncategorized")
  private fun purge(at: Long) {
    drafts.entries.removeAll { at - it.value.at >= 5 * 60_000L || at < it.value.at }
  }
  @Synchronized fun put(id: String, note: String, category: String?): Boolean {
    val trimmed = note.trim().take(800)
    if (!validId.matches(id) || trimmed.isEmpty()) return false
    val at = now()
    purge(at)
    drafts.remove(id)
    drafts[id] = Entry(Draft(trimmed, category?.takeIf { it in categories }), at)
    while (drafts.size > 3) drafts.remove(drafts.keys.first())
    return true
  }
  @Synchronized fun take(id: String): Draft? {
    purge(now())
    if (!validId.matches(id)) return null
    return drafts.remove(id)?.draft
  }
  @Synchronized fun clear() { drafts.clear() }
}

internal object CompanionDrafts {
  private val store = CompanionDraftStore()
  fun put(id: String, note: String, category: String?) = store.put(id, note, category)
  fun take(id: String) = store.take(id)
  fun clear() = store.clear()
}
