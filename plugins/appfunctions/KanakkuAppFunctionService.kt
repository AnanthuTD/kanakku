package app.tinkerbox.kanakku

import androidx.annotation.RequiresApi
import androidx.appfunctions.AppFunctionAppUnknownException
import androidx.appfunctions.AppFunctionDeclaration
import androidx.appfunctions.AppFunctionElementNotFoundException
import androidx.appfunctions.AppFunctionInvalidArgumentException
import androidx.appfunctions.AppFunctionPermissionRequiredException
import androidx.appfunctions.AppFunctionSerializable
import androidx.appfunctions.AppFunctionService
import androidx.appfunctions.AppFunctionServiceEntryPoint
import expo.modules.kanakku.AssistantData
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.Locale
import java.util.UUID

/** A labelled total returned by spending summary and analytics functions. */
@AppFunctionSerializable(isDescribedByKDoc = true)
data class SpendBucket(
  /** Category, source, month, or merchant represented by this total. */
  val label: String,
  /** Net INR spending represented by this row; refunds reduce the total. */
  val netSpend: Double,
  /** Number of counted transaction records represented by this row. */
  val transactionCount: Int
)

/** The merchant with the highest net spend in the requested range. */
@AppFunctionSerializable(isDescribedByKDoc = true)
data class TopMerchantResult(
  /** Merchant label stored in Kanakku. */
  val merchant: String,
  /** Net INR spending at this merchant. */
  val netSpend: Double
)

/** Aggregate spending totals with optional date, category, and source filters. */
@AppFunctionSerializable(isDescribedByKDoc = true)
data class SpendingSummaryResult(
  /** ISO currency code for the totals. */
  val currency: String,
  /** Inclusive start date in YYYY-MM-DD format, or null when unbounded. */
  val startDate: String?,
  /** Inclusive end date in YYYY-MM-DD format, or null when unbounded. */
  val endDate: String?,
  /** Net counted spending after refunds, in INR. */
  val netSpend: Double,
  /** Number of transaction records with a non-zero counted spend amount. */
  val transactionCount: Int,
  /** Counted spend grouped by category. */
  val byCategory: List<SpendBucket>,
  /** Counted spend grouped by import source. */
  val bySource: List<SpendBucket>,
  /** Highest-spend merchant, or null when there is no counted spending. */
  val topMerchant: TopMerchantResult?,
  /** Important exclusions applied when calculating these totals. */
  val note: String
)

/** A grouped spending result from the selected analytics query. */
@AppFunctionSerializable(isDescribedByKDoc = true)
data class SpendingAnalyticsResult(
  /** ISO currency code for the totals. */
  val currency: String,
  /** Inclusive start date in YYYY-MM-DD format, or null when unbounded. */
  val startDate: String?,
  /** Inclusive end date in YYYY-MM-DD format, or null when unbounded. */
  val endDate: String?,
  /** Grouping used: month, category, or merchant. */
  val groupBy: String,
  /** Merchant filter used, or null. */
  val merchantFilter: String?,
  /** Category filter used, or null. */
  val categoryFilter: String?,
  /** Net counted spending after refunds, in INR. */
  val netSpend: Double,
  /** Number of transaction records with a non-zero counted spend amount. */
  val transactionCount: Int,
  /** Spending totals in the requested grouping. */
  val breakdown: List<SpendBucket>,
  /** Highest-spend merchant, or null when there is no counted spending. */
  val topMerchant: TopMerchantResult?,
  /** Important exclusions applied when calculating these totals. */
  val note: String
)

/** A locally inferred recurring-payment pattern, not an active mandate. */
@AppFunctionSerializable(isDescribedByKDoc = true)
data class RecurringPaymentResult(
  /** Merchant label associated with the pattern. */
  val merchant: String,
  /** Pattern type such as subscription, bill, or recurring. */
  val type: String,
  /** Inferred cadence such as weekly, monthly, or yearly. */
  val cadence: String,
  /** Confidence assigned by Kanakku's local pattern detector. */
  val confidence: String,
  /** Status inferred from the recorded charge history. */
  val status: String,
  /** Date of the latest matching recorded payment. */
  val lastPaidAt: String,
  /** Estimated next date based on prior spacing; not a guaranteed charge date. */
  val estimatedNextAt: String,
  /** Median-like usual amount in INR. */
  val usualAmount: Double,
  /** Lowest observed amount in INR. */
  val minAmount: Double,
  /** Highest observed amount in INR. */
  val maxAmount: Double,
  /** User decision for this pattern, or suggested when not reviewed. */
  val decision: String,
  /** Evidence strings produced by the local detector. */
  val evidence: List<String>
)

/** A matching transaction returned for search or manual-expense duplicate review. */
@AppFunctionSerializable(isDescribedByKDoc = true)
data class TransactionMatchResult(
  /** Kanakku transaction identifier, needed only to target a later update. */
  val transactionId: String,
  /** Transaction date in the journal. */
  val date: String,
  /** Bank-stated transaction time, or null when unavailable. */
  val transactionTime: String?,
  /** Merchant or payee label. */
  val merchant: String,
  /** Original transaction amount in its currency. */
  val amount: Double,
  /** Contribution to Kanakku counted spend in INR; refunds may be negative. */
  val spendAmount: Double,
  /** ISO currency code for the original amount. */
  val currency: String,
  /** Current category label. */
  val category: String,
  /** Transaction kind, such as purchase, refund, transfer, or lent. */
  val kind: String,
  /** Import source, such as SMS, email, or manual. */
  val source: String,
  /** Issuer or institution label, when available. */
  val bank: String,
  /** Masked account label stored in the journal. */
  val account: String
)

/** Search results with a stable count and the matching transaction rows. */
@AppFunctionSerializable(isDescribedByKDoc = true)
data class TransactionSearchResult(
  /** Number of rows returned after filters and the result limit. */
  val count: Int,
  /** Matching transactions; existing note text and raw alert content are omitted. */
  val transactions: List<TransactionMatchResult>
)

/** Status for an in-app staged write or a possible duplicate. */
@AppFunctionSerializable(isDescribedByKDoc = true)
data class AssistantActionResult(
  /** Status: awaiting_kanakku_approval, queued_for_save, or possible_match. */
  val status: String,
  /** Identifier for a queued action, or null when the user must resolve a match first. */
  val actionId: String?,
  /** Human-readable status; queued changes are not saved until Kanakku confirms. */
  val message: String,
  /** Potential matching payments when status is possible_match. */
  val matches: List<TransactionMatchResult>
)

@RequiresApi(36)
@AppFunctionServiceEntryPoint(
  serviceName = "KanakkuAppFunctionServiceImpl",
  appFunctionXmlFileName = "kanakku_app_functions"
)
abstract class KanakkuAppFunctionService : AppFunctionService() {
  /**
   * Return net spending totals and category/source summaries for Kanakku's counted payments.
   * Refunds reduce totals; transfers, loans, held, excluded, and zero-spend rows are omitted.
   *
   * @param startDate Inclusive lower date in YYYY-MM-DD format; omitted for no lower bound.
   * @param endDate Inclusive upper date in YYYY-MM-DD format; omitted for no upper bound.
   * @param category Exact case-insensitive category label filter; omitted for all categories.
   * @param source Exact case-insensitive source filter such as sms, email, or manual.
   * @throws AppFunctionInvalidArgumentException If a supplied date is not a valid YYYY-MM-DD date.
   * @throws AppFunctionPermissionRequiredException If Kanakku is locked or Gemini access is off.
   */
  @AppFunctionDeclaration(isEnabled = false, isDescribedByKDoc = true)
  suspend fun getSpendingSummary(
    startDate: String? = null,
    endDate: String? = null,
    category: String? = null,
    source: String? = null
  ): SpendingSummaryResult = withContext(Dispatchers.IO) {
    val snapshot = assistantData()
    validateDateBounds(startDate, endDate)
    val counted = rows(snapshot).filter { row ->
      inRange(row, startDate, endDate) && matches(row, category, source) && row.optDouble("spendAmount", 0.0) != 0.0
    }
    val byCategory = buckets(counted, "category")
    val bySource = buckets(counted, "source")
    val byMerchant = buckets(counted, "merchant")
    SpendingSummaryResult(
      currency = "INR",
      startDate = startDate,
      endDate = endDate,
      netSpend = roundMoney(counted.sumOf { it.optDouble("spendAmount", 0.0) }),
      transactionCount = counted.size,
      byCategory = byCategory,
      bySource = bySource,
      topMerchant = byMerchant.maxByOrNull { it.netSpend }?.let { TopMerchantResult(it.label, it.netSpend) },
      note = COUNTED_SPEND_NOTE
    )
  }

  /**
   * Break down counted spending by month, category, or merchant.
   * Merchant filtering is a case-insensitive partial match.
   *
   * @param startDate Inclusive lower date in YYYY-MM-DD format; omitted for no lower bound.
   * @param endDate Inclusive upper date in YYYY-MM-DD format; omitted for no upper bound.
   * @param groupBy month, category, or merchant; defaults to month.
   * @param merchant Case-insensitive partial merchant filter.
   * @param category Exact case-insensitive category filter.
   * @param limit Maximum rows to return, clamped to 1–36; defaults to 24.
   * @throws AppFunctionInvalidArgumentException If dates or groupBy are invalid.
   * @throws AppFunctionPermissionRequiredException If Kanakku is locked or Gemini access is off.
   */
  @AppFunctionDeclaration(isEnabled = false, isDescribedByKDoc = true)
  suspend fun getSpendingAnalytics(
    startDate: String? = null,
    endDate: String? = null,
    groupBy: String? = null,
    merchant: String? = null,
    category: String? = null,
    limit: Int = 24
  ): SpendingAnalyticsResult = withContext(Dispatchers.IO) {
    val snapshot = assistantData()
    validateDateBounds(startDate, endDate)
    val group = groupBy.orEmpty().lowercase(Locale.ROOT).trim().ifBlank { "month" }
    if (group !in setOf("month", "category", "merchant"))
      throw AppFunctionInvalidArgumentException("groupBy must be month, category, or merchant.")
    val needle = merchant.orEmpty().trim().lowercase(Locale.ROOT).take(100)
    val counted = rows(snapshot).filter { row ->
      inRange(row, startDate, endDate) && matches(row, category, null) &&
        (needle.isBlank() || row.optString("merchant").lowercase(Locale.ROOT).contains(needle)) &&
        row.optDouble("spendAmount", 0.0) != 0.0
    }
    val grouped = counted.groupBy { row ->
      when (group) {
        "month" -> row.optString("date").take(7).ifBlank { "Unknown date" }
        "category" -> row.optString("category", "Uncategorized").ifBlank { "Uncategorized" }
        else -> row.optString("merchant", "Unknown merchant").ifBlank { "Unknown merchant" }
      }
    }
    val breakdown = grouped.map { (label, items) ->
      SpendBucket(label, roundMoney(items.sumOf { it.optDouble("spendAmount", 0.0) }), items.size)
    }.let { list ->
      if (group == "month") list.sortedBy { it.label } else list.sortedByDescending { it.netSpend }
    }.take(limit.coerceIn(1, 36))
    val merchants = buckets(counted, "merchant")
    SpendingAnalyticsResult(
      currency = "INR",
      startDate = startDate,
      endDate = endDate,
      groupBy = group,
      merchantFilter = merchant,
      categoryFilter = category,
      netSpend = roundMoney(counted.sumOf { it.optDouble("spendAmount", 0.0) }),
      transactionCount = counted.size,
      breakdown = breakdown,
      topMerchant = merchants.maxByOrNull { it.netSpend }?.let { TopMerchantResult(it.label, it.netSpend) },
      note = COUNTED_SPEND_NOTE
    )
  }

  /**
   * Return locally inferred recurring-payment patterns, not active subscriptions or bank mandates.
   * @throws AppFunctionPermissionRequiredException If Kanakku is locked or Gemini access is off.
   */
  @AppFunctionDeclaration(isEnabled = false, isDescribedByKDoc = true)
  suspend fun getRecurringPayments(): List<RecurringPaymentResult> = withContext(Dispatchers.IO) {
    val source = assistantData().optJSONArray("recurringPayments") ?: JSONArray()
    buildList {
      for (index in 0 until source.length()) {
        val row = source.optJSONObject(index) ?: continue
        add(RecurringPaymentResult(
          merchant = row.optString("merchant"),
          type = row.optString("type"),
          cadence = row.optString("cadence"),
          confidence = row.optString("confidence"),
          status = row.optString("status"),
          lastPaidAt = row.optString("lastPaidAt"),
          estimatedNextAt = row.optString("estimatedNextAt"),
          usualAmount = row.optDouble("usualAmount", 0.0),
          minAmount = row.optDouble("minAmount", 0.0),
          maxAmount = row.optDouble("maxAmount", 0.0),
          decision = row.optString("decision", "suggested"),
          evidence = row.optJSONArray("evidence").toStringList()
        ))
      }
    }
  }

  /**
   * Search matching payments by merchant, account label, bank, category, kind, or note text.
   * Existing note text is searched locally and never included in returned results.
   *
   * @param query Optional case-insensitive partial text query.
   * @param startDate Inclusive lower date in YYYY-MM-DD format.
   * @param endDate Inclusive upper date in YYYY-MM-DD format.
   * @param category Exact case-insensitive category filter.
   * @param source Exact case-insensitive source filter such as sms, email, or manual.
   * @param limit Maximum rows to return, clamped to 1–50; defaults to 20.
   * @throws AppFunctionInvalidArgumentException If a supplied date is not a valid YYYY-MM-DD date.
   * @throws AppFunctionPermissionRequiredException If Kanakku is locked or Gemini access is off.
   */
  @AppFunctionDeclaration(isEnabled = false, isDescribedByKDoc = true)
  suspend fun searchTransactions(
    query: String? = null,
    startDate: String? = null,
    endDate: String? = null,
    category: String? = null,
    source: String? = null,
    limit: Int = 20
  ): TransactionSearchResult = withContext(Dispatchers.IO) {
    val snapshot = assistantData()
    validateDateBounds(startDate, endDate)
    val needle = query.orEmpty().trim().lowercase(Locale.ROOT).take(100)
    val result = rows(snapshot)
      .filter { row ->
        inRange(row, startDate, endDate) && matches(row, category, source) &&
          (needle.isBlank() || listOf("merchant", "account", "bank", "category", "kind", "note")
            .any { row.optString(it).lowercase(Locale.ROOT).contains(needle) })
      }
      .sortedByDescending { it.optString("date") }
      .take(limit.coerceIn(1, 50))
      .map(::transactionResult)
    TransactionSearchResult(result.size, result)
  }

  /**
   * Stage a change to an existing payment for Kanakku's encrypted journal.
   * Required workflow: Search with "searchTransactions" first to get a valid transactionId.
   *
   * @param transactionId ID returned by searchTransactions.
   * @param merchant Replacement merchant label, if changing it.
   * @param category Existing Kanakku category label, if changing it.
   * @param note Replacement user note; existing notes are not returned by search.
   * @param markRecurring Whether to confirm or ignore the existing recurring pattern.
   * @throws AppFunctionElementNotFoundException If the transaction ID is not in the unlocked journal.
   * @throws AppFunctionInvalidArgumentException If no supported change is supplied.
   * @throws AppFunctionPermissionRequiredException If Kanakku is locked or Gemini access is off.
   */
  @AppFunctionDeclaration(isEnabled = false, isDescribedByKDoc = true)
  suspend fun updateTransaction(
    transactionId: String,
    merchant: String? = null,
    category: String? = null,
    note: String? = null,
    markRecurring: Boolean? = null
  ): AssistantActionResult = withContext(Dispatchers.IO) {
    val snapshot = assistantData()
    val row = findById(snapshot, transactionId)
      ?: throw AppFunctionElementNotFoundException("That payment was not found. Search again while Kanakku is unlocked.")
    val patch = JSONObject()
    merchant?.trim()?.takeIf { it.isNotEmpty() }?.let { patch.put("merchant", it.take(80)) }
    category?.trim()?.takeIf { it.isNotEmpty() }?.let { patch.put("category", it.take(32)) }
    note?.trim()?.let { patch.put("note", it.take(240)) }
    markRecurring?.let { patch.put("markRecurring", it) }
    if (patch.length() == 0) throw AppFunctionInvalidArgumentException("Provide at least one supported change.")
    val action = JSONObject()
      .put("id", UUID.randomUUID().toString())
      .put("type", "update")
      .put("transactionId", transactionId)
      .put("patch", patch)
      .put("merchant", row.optString("merchant"))
      .put("amount", row.optDouble("amount", 0.0))
      .put("date", row.optString("date"))
      .put("confirmRequired", confirmationRequired())
    queueResult(action)
  }

  /**
   * Stage a user-described expense after checking for similar recorded purchases.
   * Required workflow: Resolve any "possible_match" result before retrying with createSeparate=true.
   *
   * @param amountRupees Positive expense amount in INR, up to ₹10,000,000.
   * @param merchant Optional merchant label to narrow duplicate candidates.
   * @param date Optional valid expense date in YYYY-MM-DD format; omitted dates default to today.
   * @param category Existing Kanakku category label; omitted categories are saved as Uncategorized.
   * @param note Optional user-provided note.
   * @param createSeparate True only when the user chose to keep a separate expense after reviewing matches.
   * @throws AppFunctionInvalidArgumentException If amount or supplied date is invalid.
   * @throws AppFunctionPermissionRequiredException If Kanakku is locked or Gemini access is off.
   */
  @AppFunctionDeclaration(isEnabled = false, isDescribedByKDoc = true)
  suspend fun createManualExpense(
    amountRupees: Double,
    merchant: String? = null,
    date: String? = null,
    category: String? = null,
    note: String? = null,
    createSeparate: Boolean = false
  ): AssistantActionResult = withContext(Dispatchers.IO) {
    val snapshot = assistantData()
    if (!amountRupees.isFinite() || amountRupees <= 0.0 || amountRupees > 10_000_000.0)
      throw AppFunctionInvalidArgumentException("Enter an amount greater than zero and within ₹10,000,000.")
    val day = if (date.isNullOrBlank()) LocalDate.now().toString() else parseDate(date.trim()).toString()
    val targetMerchant = merchant.orEmpty().trim().lowercase(Locale.ROOT)
    val targetAmount = kotlin.math.round(amountRupees * 100.0) / 100.0
    val candidates = snapshot.optJSONArray("transactions") ?: JSONArray()
    val matches = buildList {
      for (i in 0 until candidates.length()) {
        val row = candidates.optJSONObject(i) ?: continue
        if (row.optDouble("spendAmount", 0.0) <= 0.0 || row.optBoolean("excluded") ||
          row.optString("duplicateOf").isNotBlank() || row.optString("kind", "purchase") != "purchase") continue
        val distance = runCatching { kotlin.math.abs(ChronoUnit.DAYS.between(LocalDate.parse(day), LocalDate.parse(row.optString("date").take(10)))) }.getOrDefault(Long.MAX_VALUE)
        val amountDistance = kotlin.math.abs(row.optDouble("amount", 0.0) - targetAmount)
        val rowMerchant = row.optString("merchant").trim().lowercase(Locale.ROOT)
        val merchantMatch = targetMerchant.isBlank() || (rowMerchant.isNotBlank() &&
          (rowMerchant.contains(targetMerchant) || targetMerchant.contains(rowMerchant)))
        if (distance <= 7 && amountDistance <= 1.0 && merchantMatch) add(transactionResult(row))
      }
    }.take(5)
    if (matches.isNotEmpty() && !createSeparate) {
      return@withContext AssistantActionResult(
        status = "possible_match",
        actionId = null,
        message = "Possible existing payment(s) found. Resolve a match before creating a separate expense.",
        matches = matches
      )
    }
    val details = JSONObject()
      .put("amountRupees", targetAmount)
      .put("merchant", merchant.orEmpty().trim().take(80))
      .put("date", day)
      .put("category", category.orEmpty().trim().take(32).ifBlank { "Uncategorized" })
      .put("note", note.orEmpty().trim().take(240))
      .put("createSeparate", createSeparate)
    queueResult(JSONObject()
      .put("id", UUID.randomUUID().toString())
      .put("type", "create")
      .put("details", details)
      .put("confirmRequired", confirmationRequired()))
  }

  private fun assistantData(): JSONObject {
    if (!getSharedPreferences("kanakku-settings", MODE_PRIVATE).getBoolean("geminiAppFunctions", false))
      throw AppFunctionPermissionRequiredException("Enable Gemini access in Kanakku Settings to share the requested results.")
    return AssistantData.snapshot()
      ?: throw AppFunctionPermissionRequiredException("Open and unlock Kanakku to access the journal.")
  }

  private fun rows(snapshot: JSONObject): List<JSONObject> {
    val transactions = snapshot.optJSONArray("transactions") ?: return emptyList()
    return buildList { for (index in 0 until transactions.length()) transactions.optJSONObject(index)?.let(::add) }
  }

  private fun transactionResult(row: JSONObject) = TransactionMatchResult(
    transactionId = row.optString("id"),
    date = row.optString("date"),
    transactionTime = row.optString("transactionTime").ifBlank { null },
    merchant = row.optString("merchant"),
    amount = row.optDouble("amount", 0.0),
    spendAmount = row.optDouble("spendAmount", 0.0),
    currency = row.optString("currency", "INR"),
    category = row.optString("category", "Uncategorized"),
    kind = row.optString("kind"),
    source = row.optString("source"),
    bank = row.optString("bank"),
    account = row.optString("account")
  )

  private fun findById(snapshot: JSONObject, id: String): JSONObject? {
    val rows = snapshot.optJSONArray("transactions") ?: return null
    for (i in 0 until rows.length()) {
      val row = rows.optJSONObject(i) ?: continue
      if (row.optString("id") == id) return row
    }
    return null
  }

  private fun confirmationRequired(): Boolean = getSharedPreferences("kanakku-settings", MODE_PRIVATE)
    .getBoolean("confirmGeminiChanges", true)

  private fun queueResult(action: JSONObject): AssistantActionResult {
    if (!AssistantData.enqueueAction(action))
      throw AppFunctionAppUnknownException("Kanakku could not queue this change. Open and unlock it, then try again.")
    val requiresApproval = action.optBoolean("confirmRequired")
    return AssistantActionResult(
      status = if (requiresApproval) "awaiting_kanakku_approval" else "queued_for_save",
      actionId = action.optString("id"),
      message = if (requiresApproval) "Waiting for approval in Kanakku; not saved yet." else "Queued for Kanakku to save; not saved until Kanakku confirms.",
      matches = emptyList()
    )
  }

  private fun validateDateBounds(start: String?, end: String?) {
    val lower = start?.takeIf { it.isNotBlank() }?.let { parseDate(it) }
    val upper = end?.takeIf { it.isNotBlank() }?.let { parseDate(it) }
    if (lower != null && upper != null && lower.isAfter(upper))
      throw AppFunctionInvalidArgumentException("startDate must be on or before endDate.")
  }

  private fun parseDate(value: String): LocalDate {
    if (!value.matches(Regex("\\d{4}-\\d{2}-\\d{2}")))
      throw AppFunctionInvalidArgumentException("Use a valid date in YYYY-MM-DD format.")
    return try { LocalDate.parse(value) } catch (_: Exception) {
      throw AppFunctionInvalidArgumentException("Use a valid date in YYYY-MM-DD format.")
    }
  }

  private fun inRange(row: JSONObject, start: String?, end: String?): Boolean {
    val date = row.optString("date").take(10)
    return (start.isNullOrBlank() || date >= start) && (end.isNullOrBlank() || date <= end)
  }

  private fun matches(row: JSONObject, category: String?, source: String?): Boolean =
    (category.isNullOrBlank() || row.optString("category").equals(category, true)) &&
      (source.isNullOrBlank() || row.optString("source").equals(source, true))

  private fun buckets(rows: List<JSONObject>, field: String): List<SpendBucket> = rows
    .groupBy { it.optString(field).ifBlank { if (field == "category") "Uncategorized" else "Unknown" } }
    .map { (label, items) -> SpendBucket(label, roundMoney(items.sumOf { it.optDouble("spendAmount", 0.0) }), items.size) }
    .sortedByDescending { it.netSpend }

  private fun JSONArray?.toStringList(): List<String> {
    if (this == null) return emptyList()
    return buildList { for (index in 0 until length()) optString(index).takeIf(String::isNotBlank)?.let(::add) }
  }

  private fun roundMoney(value: Double) = kotlin.math.round(value * 100.0) / 100.0

  private companion object {
    const val COUNTED_SPEND_NOTE = "Totals follow Kanakku counted-spend rules; transfers, loans, held and excluded payments are omitted, and refunds reduce spending."
  }
}
