package expo.modules.kanakku

import org.json.JSONArray
import org.json.JSONObject

/** Ephemeral assistant snapshot: kept only in process memory while the journal is unlocked. */
object AssistantData {
  @Volatile private var data: JSONObject? = null
  @Volatile private var unlocked = false
  private val actionLock = Any()
  private val pendingActions = linkedMapOf<String, JSONObject>()

  fun markUnlocked() { unlocked = true }

  fun replace(json: String): Boolean {
    if (!unlocked) return false
    val parsed = JSONObject(json)
    if (!parsed.has("transactions") || !parsed.has("recurringPayments")) return false
    data = parsed
    return true
  }

  fun clear() {
    unlocked = false
    data = null
    synchronized(actionLock) { pendingActions.clear() }
  }

  fun clearSnapshot() {
    data = null
  }

  fun clearActions() = synchronized(actionLock) { pendingActions.clear() }

  fun snapshot(): JSONObject? = if (unlocked) data else null

  fun enqueueAction(action: JSONObject): Boolean = synchronized(actionLock) {
    if (!unlocked || pendingActions.size >= 10) return@synchronized false
    val id = action.optString("id")
    if (id.isBlank()) return@synchronized false
    pendingActions[id] = JSONObject(action.toString())
    true
  }

  fun nextAction(): JSONObject? = synchronized(actionLock) {
    pendingActions.values.firstOrNull()?.let { JSONObject(it.toString()) }
  }

  fun completeAction(id: String): Boolean = synchronized(actionLock) {
    pendingActions.remove(id) != null
  }
}
