package expo.modules.kanakku

import android.Manifest
import android.animation.ValueAnimator
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.*
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.TextUtils
import android.view.*
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors
import kotlin.math.*

/** What the floating companion is doing; each state has its own pose. */
enum class Pose { ASKING, LISTENING, THINKING, HAPPY }

/**
 * Floating companion over other apps: the character alone, a speech bubble above its
 * head, tap the character to answer by voice, drag it onto the X to dismiss.
 * The answer is sealed into the inbox and applied when Kanakku next unlocks.
 */
object AvatarWindow {
  private val handler = Handler(Looper.getMainLooper())
  private val worker = Executors.newSingleThreadExecutor()
  private var wm: WindowManager? = null
  private var avatar: CompanionView? = null
  private var avatarParams: WindowManager.LayoutParams? = null
  private var bubble: LinearLayout? = null
  private var bubbleParams: WindowManager.LayoutParams? = null
  private var target: TextView? = null
  private var dismiss: Runnable? = null
  private var recorder: PcmRecorder? = null
  private var generation = 0
  private var paymentId = ""
  private var merchant: String? = null
  private var question = ""

  private data class Limits(val left: Int, val right: Int, val top: Int, val bottom: Int)
  private fun limits(wm: WindowManager, width: Int, height: Int, gap: Int): Limits {
    val metrics = wm.currentWindowMetrics
    val bounds = metrics.bounds
    val insets = metrics.windowInsets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
    val left = insets.left + gap
    val top = insets.top + gap
    return Limits(left, max(left, bounds.width() - insets.right - width - gap), top, max(top, bounds.height() - insets.bottom - height - gap))
  }
  private fun dp(context: Context, v: Int) = (v * context.resources.displayMetrics.density).toInt()
  private fun overlayParams(width: Int, height: Int) = WindowManager.LayoutParams(width, height, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL, PixelFormat.TRANSLUCENT).apply { gravity = Gravity.TOP or Gravity.LEFT }

  fun hide() {
    generation++
    dismiss?.let { handler.removeCallbacks(it) }
    dismiss = null
    recorder?.cancel(); recorder = null
    WhisperEngine.abort()
    listOf<View?>(avatar, bubble, target).forEach { view -> view?.let { runCatching { wm?.removeView(it) } } }
    avatar = null; bubble = null; target = null
    avatarParams = null; bubbleParams = null; wm = null
  }

  private fun close(context: Context) {
    hide()
    context.stopService(Intent(context, AvatarService::class.java))
  }

  fun reposition(context: Context) {
    val manager = wm ?: return
    val view = avatar ?: return
    val params = avatarParams ?: return
    val size = params.width
    val bounds = limits(manager, size, size, dp(context, 6))
    val prefs = context.getSharedPreferences("kanakku-settings", Context.MODE_PRIVATE)
    params.x = if (prefs.getBoolean("avatarLeft", false)) bounds.left else bounds.right
    val fraction = prefs.getFloat("avatarFraction", 0.35f).takeIf { it.isFinite() }?.coerceIn(0f, 1f) ?: 0.35f
    params.y = bounds.top + ((bounds.bottom - bounds.top) * fraction).toInt()
    view.facingLeft = !prefs.getBoolean("avatarLeft", false)
    runCatching { manager.updateViewLayout(view, params) }
    placeBubble(context)
  }

  fun show(context: Context, id: String, amount: Long?, payee: String?) {
    hide()
    val app = context.applicationContext
    val manager = app.getSystemService(WindowManager::class.java)
    wm = manager
    paymentId = id
    merchant = payee
    question = VoiceText.question(amount, payee)
    val prefs = app.getSharedPreferences("kanakku-settings", Context.MODE_PRIVATE)
    val size = dp(app, 104)
    val bounds = limits(manager, size, size, dp(app, 6))
    val left = prefs.getBoolean("avatarLeft", false)
    val fraction = prefs.getFloat("avatarFraction", 0.35f).takeIf { it.isFinite() }?.coerceIn(0f, 1f) ?: 0.35f
    val params = overlayParams(size, size).apply {
      x = if (left) bounds.left else bounds.right
      y = bounds.top + ((bounds.bottom - bounds.top) * fraction).toInt()
    }
    val view = CompanionView(app).apply {
      facingLeft = !left
      isFocusable = true
      isSoundEffectsEnabled = false
    }
    avatarParams = params
    avatar = view
    attachTouch(app, view, params)
    manager.addView(view, params)
    Diagnostics.log("info", "companion", "shown", mapOf("preview" to (id == Prompts.PREVIEW_ID), "hasAmount" to (amount != null)))
    showBubble(app, question, null, null)
    setPose(app, Pose.ASKING)
    expireLater(app, 20_000)
  }

  private fun setPose(context: Context, pose: Pose) {
    val view = avatar ?: return
    view.pose = pose
    view.contentDescription = when (pose) {
      Pose.ASKING -> "$question Tap the companion to answer by voice. Drag it to the X at the bottom to dismiss."
      Pose.LISTENING -> "Listening. Tap the companion when you are done."
      Pose.THINKING -> "Understanding your answer."
      Pose.HAPPY -> "Answer ready. Tap the companion to answer again."
    }
    view.sendAccessibilityEvent(android.view.accessibility.AccessibilityEvent.TYPE_VIEW_FOCUSED)
  }

  private fun expireLater(context: Context, delay: Long) {
    dismiss?.let { handler.removeCallbacks(it) }
    dismiss = Runnable { close(context) }.also { handler.postDelayed(it, delay) }
  }
  private fun holdOpen() { dismiss?.let { handler.removeCallbacks(it) }; dismiss = null }

  private fun feedback(context: Context, view: View) {
    view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
    val prefs = context.getSharedPreferences("kanakku-settings", Context.MODE_PRIVATE)
    val audio = context.getSystemService(AudioManager::class.java)
    if (prefs.getBoolean("sounds", true) && audio.ringerMode == AudioManager.RINGER_MODE_NORMAL) audio.playSoundEffect(AudioManager.FX_KEY_CLICK)
  }

  private fun openApp(context: Context, voice: Boolean, photo: Boolean = false) {
    // The real camera opens inside authenticated Kanakku, never from the background overlay.
    context.startActivity(Prompts.open(context, paymentId, voice, photo))
    close(context)
  }

  // ---- Speech bubble -------------------------------------------------------------------

  private fun colors(context: Context): Pair<Int, Int> {
    val dark = context.getSharedPreferences("kanakku-settings", Context.MODE_PRIVATE).getString("theme", "light") == "dark"
    return Color.parseColor(if (dark) "#1D2821" else "#FFFDF7") to Color.parseColor(if (dark) "#ECF0E5" else "#203C31")
  }

  /** Text plus optional result actions; tapping the bubble itself opens the payment. */
  private fun showBubble(context: Context, text: String, detail: String?, actions: List<Pair<String, () -> Unit>>?) {
    val manager = wm ?: return
    val (surface, ink) = colors(context)
    val accent = Color.parseColor("#345D45")
    val box = bubble ?: LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      elevation = dp(context, 6).toFloat()
    }
    box.removeAllViews()
    val pad = dp(context, 12)
    box.setPadding(pad, pad, pad, pad + dp(context, 9))
    box.background = BubbleDrawable(surface, Color.parseColor("#22000000"), dp(context, 16).toFloat(), dp(context, 10).toFloat())
    box.addView(TextView(context).apply {
      this.text = text
      setTextColor(ink)
      textSize = 15f
      maxWidth = dp(context, 236)
      ellipsize = TextUtils.TruncateAt.END
      maxLines = 4
    })
    detail?.let {
      box.addView(TextView(context).apply {
        this.text = it
        setTextColor(accent)
        textSize = 13f
        setPadding(0, dp(context, 4), 0, 0)
        maxWidth = dp(context, 236)
      })
    }
    val visibleActions = actions ?: if(avatar?.pose == Pose.ASKING)
      listOf("Photo" to { openApp(context, false, true) }) else null
    visibleActions?.let { list ->
      val row = LinearLayout(context).apply { gravity = Gravity.END; setPadding(0, dp(context, 8), 0, 0) }
      list.forEachIndexed { index, (label, action) ->
        val primary = index == list.lastIndex
        row.addView(TextView(context).apply {
          this.text = label
          textSize = 14f
          gravity = Gravity.CENTER
          minHeight = dp(context, 48)
          minWidth = dp(context, 72)
          setPadding(dp(context, 14), 0, dp(context, 14), 0)
          setTextColor(if (primary) Color.WHITE else ink)
          background = GradientDrawable().apply {
            cornerRadius = dp(context, 22).toFloat()
            if (primary) setColor(accent) else setStroke(dp(context, 1), Color.parseColor("#55345D45"))
          }
          isClickable = true
          contentDescription = label
          setOnClickListener { view -> feedback(context, view); action() }
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { marginStart = dp(context, 8) })
      }
      box.addView(row)
    }
    box.isClickable = true
    box.contentDescription = listOfNotNull(text, detail).joinToString(" ")
    box.setOnClickListener { view ->
      // Asking: open this payment in Kanakku. Results use their own buttons.
      if (avatar?.pose == Pose.ASKING) { feedback(context, view); openApp(context, false) }
    }
    if (bubble == null) {
      val params = overlayParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT)
      bubble = box
      bubbleParams = params
      manager.addView(box, params)
    }
    box.visibility = View.VISIBLE
    box.post { placeBubble(context) }
    placeBubble(context)
  }

  /** Above the character's head, tail pointing at it; below if there is no room above. */
  private fun placeBubble(context: Context) {
    val manager = wm ?: return
    val box = bubble ?: return
    val params = bubbleParams ?: return
    val a = avatarParams ?: return
    box.measure(View.MeasureSpec.UNSPECIFIED, View.MeasureSpec.UNSPECIFIED)
    val width = box.measuredWidth
    val height = box.measuredHeight
    val screen = manager.currentWindowMetrics.bounds
    val gap = dp(context, 6)
    val rightSide = a.x + a.width / 2 > screen.width() / 2
    params.x = (if (rightSide) a.x + a.width - width else a.x).coerceIn(gap, max(gap, screen.width() - width - gap))
    val above = a.y - height + dp(context, 14)
    val below = a.y + a.height - dp(context, 6)
    val top = manager.currentWindowMetrics.windowInsets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars()).top + gap
    val tailDown = above >= top
    params.y = if (tailDown) above else below
    (box.background as? BubbleDrawable)?.let {
      it.tailDown = tailDown
      it.tailX = (a.x + a.width / 2 - params.x).toFloat().coerceIn(it.radius * 1.5f, width - it.radius * 1.5f)
      it.invalidateSelf()
    }
    val pad = dp(context, 12)
    val tail = dp(context, 9)
    box.setPadding(pad, pad + if (tailDown) 0 else tail, pad, pad + if (tailDown) tail else 0)
    runCatching { manager.updateViewLayout(box, params) }
  }

  // ---- Dragging and the dismiss target ---------------------------------------------------

  private fun showTarget(context: Context) {
    val manager = wm ?: return
    if (target != null) return
    val size = dp(context, 64)
    val view = TextView(context).apply {
      text = "✕"
      textSize = 24f
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#CC203C31")) }
      contentDescription = "Drop here to dismiss"
    }
    val screen = manager.currentWindowMetrics
    val bottom = screen.windowInsets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars()).bottom
    val params = overlayParams(size, size).apply {
      x = (screen.bounds.width() - size) / 2
      y = screen.bounds.height() - bottom - size - dp(context, 32)
      flags = flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
    }
    target = view
    runCatching { manager.addView(view, params) }
  }
  private fun hideTarget() { target?.let { runCatching { wm?.removeView(it) } }; target = null }
  private fun overTarget(rawX: Float, rawY: Float): Boolean {
    val view = target ?: return false
    val location = IntArray(2).also { view.getLocationOnScreen(it) }
    val cx = location[0] + view.width / 2f
    val cy = location[1] + view.height / 2f
    return hypot(rawX - cx, rawY - cy) < view.width * 1.1f
  }

  private fun attachTouch(context: Context, view: CompanionView, params: WindowManager.LayoutParams) {
    var downX = 0f; var downY = 0f; var startX = 0; var startY = 0; var dragged = false
    val slop = ViewConfiguration.get(context).scaledTouchSlop
    view.setOnTouchListener { _, event ->
      val manager = wm ?: return@setOnTouchListener false
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> { downX = event.rawX; downY = event.rawY; startX = params.x; startY = params.y; dragged = false; true }
        MotionEvent.ACTION_MOVE -> {
          if (!dragged && hypot(event.rawX - downX, event.rawY - downY) > slop && view.pose != Pose.LISTENING) {
            // Dragging never records; hide the bubble and offer the dismiss target.
            dragged = true
            holdOpen()
            bubble?.visibility = View.INVISIBLE
            showTarget(context)
          }
          if (dragged) {
            val screen = manager.currentWindowMetrics.bounds
            params.x = (startX + event.rawX - downX).toInt().coerceIn(0, screen.width() - params.width)
            params.y = (startY + event.rawY - downY).toInt().coerceIn(0, screen.height() - params.height)
            view.overTarget = overTarget(event.rawX, event.rawY)
            target?.scaleX = if (view.overTarget) 1.25f else 1f
            target?.scaleY = target?.scaleX ?: 1f
            runCatching { manager.updateViewLayout(view, params) }
          }
          true
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          if (dragged) {
            val drop = event.actionMasked == MotionEvent.ACTION_UP && overTarget(event.rawX, event.rawY)
            hideTarget()
            view.overTarget = false
            if (drop) {
              feedback(context, view)
              // Dismissed on the X: no prompts for 30 minutes.
              Diagnostics.log("info", "companion", "dismissed")
              context.getSharedPreferences("kanakku-settings", Context.MODE_PRIVATE).edit().putLong("snooze", System.currentTimeMillis() + 30 * 60 * 1000).apply()
              close(context)
            } else {
              settle(context, view, params)
              bubble?.visibility = View.VISIBLE
              placeBubble(context)
              if (view.pose == Pose.ASKING) expireLater(context, 20_000)
            }
          } else if (event.actionMasked == MotionEvent.ACTION_UP) {
            feedback(context, view)
            onTap(context)
          }
          true
        }
        else -> false
      }
    }
  }

  private fun settle(context: Context, view: CompanionView, params: WindowManager.LayoutParams) {
    val manager = wm ?: return
    val bounds = limits(manager, params.width, params.height, dp(context, 6))
    val left = params.x + params.width / 2 < manager.currentWindowMetrics.bounds.width() / 2
    params.x = if (left) bounds.left else bounds.right
    params.y = params.y.coerceIn(bounds.top, bounds.bottom)
    view.facingLeft = !left
    runCatching { manager.updateViewLayout(view, params) }
    val vertical = if (bounds.bottom == bounds.top) 0f else (params.y - bounds.top).toFloat() / (bounds.bottom - bounds.top)
    context.getSharedPreferences("kanakku-settings", Context.MODE_PRIVATE).edit()
      .putBoolean("avatarPlacementV2", true).putBoolean("avatarLeft", left).putFloat("avatarFraction", vertical).apply()
  }

  // ---- Answering by voice --------------------------------------------------------------

  private fun onTap(context: Context) {
    when (avatar?.pose) {
      Pose.ASKING, Pose.HAPPY -> startListening(context)
      Pose.LISTENING -> recorder?.finish()
      else -> {}
    }
  }

  private fun startListening(context: Context) {
    val mic = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    // Without permission, a supported processor or the microphone service, answer in Kanakku.
    val service = if (mic && WhisperEngine.supported) AvatarService.microphone(true) else null
    if (!mic || !WhisperEngine.supported || service != true) {
      Diagnostics.log("info", "companion", "voice-fallback-to-app", mapOf("micPermission" to mic, "cpuSupported" to WhisperEngine.supported, "service" to service))
      openApp(context, true); return
    }
    Diagnostics.log("info", "companion", "listening")
    holdOpen()
    val session = ++generation
    setPose(context, Pose.LISTENING)
    showBubble(context, "Listening… tap me when you're done.", null, null)
    val clip = PcmRecorder()
    recorder = clip
    clip.record { samples, code, _ ->
      handler.post {
        AvatarService.microphone(false)
        Diagnostics.log("info", "companion", "recorded", mapOf("samples" to samples, "code" to code))
        if (session != generation) return@post
        when {
          samples != null -> transcribe(context, session, clip)
          code == "VOICE_SILENT_INPUT" -> openApp(context, true)
          code == "VOICE_CANCELLED" -> {}
          else -> retry(context, "I didn't catch that. Tap me to try again.")
        }
      }
    }
  }

  private fun retry(context: Context, message: String) {
    setPose(context, Pose.ASKING)
    showBubble(context, message, question, null)
    expireLater(context, 20_000)
  }

  private fun transcribe(context: Context, session: Int, clip: PcmRecorder) {
    setPose(context, Pose.THINKING)
    showBubble(context, "Understanding…", null, null)
    val hint = VoiceText.hint(merchant)
    val started = SystemClock.elapsedRealtime()
    worker.execute {
      val outcome = runCatching {
        val model = VoiceModels.bundled(context)
        val path = VoiceModels.path(context, model.asset, model.sha256)
        val samples = clip.takeClip() ?: error("No recording")
        try {
          val result = WhisperEngine.transcribe(path, samples, 4,
            if (model.languages.size == 1) model.languages[0] else "auto", model.languages.any { it != "en" }, hint)
          val text = result.text.trim()
          if (result.aborted || text.isEmpty() || VoiceText.isFiller(text) || result.language !in model.languages) null
          else {
            val note = VoiceText.formatNote(text)
            val suggestion = if (VoiceText.isMixedPurpose(note)) null
              else runCatching { SemanticClassifier.suggest(context, note) }.getOrNull()
            note to suggestion?.takeIf { it.similarity >= 0.3 && it.margin >= 0.055 }?.category
          }
        } finally { samples.fill(0) }
      }
      Diagnostics.log(if (outcome.isFailure) "error" else "info", "companion", "transcribed",
        mapOf("ms" to SystemClock.elapsedRealtime() - started, "understood" to (outcome.getOrNull() != null), "category" to outcome.getOrNull()?.second, "words" to outcome.getOrNull()?.first?.split(" ")?.size),
        outcome.exceptionOrNull())
      handler.post {
        if (session != generation) return@post
        val answer = outcome.getOrNull()
        if (answer == null) retry(context, "I didn't catch that. Tap me to try again.")
        else showAnswer(context, answer.first, answer.second)
      }
    }
  }

  private fun showAnswer(context: Context, note: String, category: String?) {
    setPose(context, Pose.HAPPY)
    val detail = category?.let { "→ $it" } ?: "Pick a category in Kanakku"
    showBubble(context, "“$note”", detail, listOf(
      "Photo" to { handoffAnswer(context, note, category, true) },
      "Edit" to { handoffAnswer(context, note, category, false) },
      "Save" to {
        if (save(context, note, category)) {
          setPose(context, Pose.HAPPY)
          showBubble(context, if (paymentId == Prompts.PREVIEW_ID) "Preview — nothing was saved." else "Saved. Thank you!", null, null)
          expireLater(context, 1_500)
        } else handoffAnswer(context, note, category, false)
      },
    ))
    expireLater(context, 45_000)
  }

  /** Transfer only an unsaved draft through process memory; no note/category goes into the URL. */
  private fun handoffAnswer(context: Context, note: String, category: String?, photo: Boolean) {
    if (paymentId != Prompts.PREVIEW_ID) CompanionDrafts.put(paymentId, note, category)
    openApp(context, false, photo)
  }

  /** Seals the answer for this payment; the preview never stores anything. */
  private fun save(context: Context, note: String, category: String?): Boolean {
    if (paymentId == Prompts.PREVIEW_ID) return true
    val result = runCatching { Vault(context).saveAnswer(paymentId, note, category) }
    val saved = result.getOrDefault(false)
    Diagnostics.log(if (saved) "info" else "error", "companion", "answer-saved", mapOf("saved" to saved, "category" to category), result.exceptionOrNull())
    if (saved) KanakkuModule.notifyArrival()
    return saved
  }
}

/** Rounded speech bubble with a small tail pointing at the companion. */
class BubbleDrawable(private val fill: Int, private val shadow: Int, val radius: Float, private val tail: Float) : Drawable() {
  var tailDown = true
  var tailX = 0f
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  override fun draw(canvas: Canvas) {
    val b = bounds
    val body = RectF(b.left.toFloat(), b.top + if (tailDown) 0f else tail, b.right.toFloat(), b.bottom - if (tailDown) tail else 0f)
    val path = Path().apply {
      addRoundRect(body, radius, radius, Path.Direction.CW)
      val x = b.left + tailX
      if (tailDown) { moveTo(x - tail, body.bottom - 1); lineTo(x, b.bottom.toFloat()); lineTo(x + tail, body.bottom - 1) }
      else { moveTo(x - tail, body.top + 1); lineTo(x, b.top.toFloat()); lineTo(x + tail, body.top + 1) }
      close()
    }
    paint.color = shadow
    canvas.save(); canvas.translate(0f, 2f); canvas.drawPath(path, paint); canvas.restore()
    paint.color = fill
    canvas.drawPath(path, paint)
  }
  override fun setAlpha(alpha: Int) { paint.alpha = alpha }
  override fun setColorFilter(colorFilter: ColorFilter?) { paint.colorFilter = colorFilter }
  @Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.TRANSLUCENT
}

/**
 * The companion character. Asking: holds a small mic to its own mouth and talks.
 * Listening: turns the mic toward you, with pulsing sound rings. Thinking: mic down,
 * dots above its head. Happy: big smile. Respects the system animation setting.
 */
class CompanionView(context: Context) : View(context) {
  var pose = Pose.ASKING
    set(value) { field = value; invalidate() }
  /** Hold the mic on the side facing the middle of the screen. */
  var facingLeft = true
    set(value) { field = value; invalidate() }
  var overTarget = false
    set(value) { field = value; invalidate() }
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val w = width.toFloat()
    val h = height.toFloat()
    val moving = ValueAnimator.areAnimatorsEnabled()
    val now = SystemClock.uptimeMillis()
    val cycle = (now % 4200) / 4200f
    val dir = if (facingLeft) -1f else 1f
    val bob = if (moving && pose != Pose.LISTENING) sin(cycle * 2 * PI).toFloat() * h * .02f else 0f
    canvas.save()
    if (overTarget) canvas.scale(.8f, .8f, w / 2, h / 2)
    canvas.translate(0f, bob)

    // Body, leaf and cheeks match the in-app mascot palette.
    val left = w * .2f; val right = w * .8f; val top = h * .24f; val bottom = h * .9f
    val cx = (left + right) / 2
    paint.style = Paint.Style.FILL
    paint.color = Color.parseColor("#26000000")
    canvas.drawOval(left + w * .04f, bottom - h * .02f, right - w * .04f, bottom + h * .05f, paint)
    paint.color = Color.parseColor("#3F6149")
    canvas.drawRoundRect(left, top, right, bottom, w * .2f, w * .2f, paint)
    paint.color = Color.parseColor("#A6BB75")
    canvas.drawOval(cx + w * .02f, top - h * .13f, cx + w * .2f, top + h * .03f, paint)
    paint.color = Color.parseColor("#A6BFA480")
    canvas.drawOval(left + w * .07f, top + h * .38f, left + w * .17f, top + h * .44f, paint)
    canvas.drawOval(right - w * .17f, top + h * .38f, right - w * .07f, top + h * .44f, paint)

    // Eyes.
    val eyeY = top + h * .27f
    val eyeL = cx - w * .11f; val eyeR = cx + w * .11f
    val look = when (pose) { Pose.LISTENING -> dir * w * .015f; Pose.THINKING -> 0f; else -> 0f }
    paint.color = Color.parseColor("#F5EED7")
    when (pose) {
      Pose.HAPPY -> {
        paint.style = Paint.Style.STROKE; paint.strokeWidth = w * .028f; paint.strokeCap = Paint.Cap.ROUND
        canvas.drawArc(eyeL - w * .045f, eyeY - h * .03f, eyeL + w * .045f, eyeY + h * .04f, 200f, 140f, false, paint)
        canvas.drawArc(eyeR - w * .045f, eyeY - h * .03f, eyeR + w * .045f, eyeY + h * .04f, 200f, 140f, false, paint)
        paint.style = Paint.Style.FILL
      }
      else -> {
        val blink = moving && pose == Pose.ASKING && cycle > .95f
        val ry = if (blink) h * .008f else if (pose == Pose.LISTENING) h * .05f else h * .042f
        val up = if (pose == Pose.THINKING) -h * .02f else 0f
        canvas.drawOval(eyeL - w * .035f + look, eyeY - ry + up, eyeL + w * .035f + look, eyeY + ry + up, paint)
        canvas.drawOval(eyeR - w * .035f + look, eyeY - ry + up, eyeR + w * .035f + look, eyeY + ry + up, paint)
      }
    }

    // Mouth: talking while asking, small smile listening, flat thinking, big smile happy.
    val mouthY = top + h * .42f
    paint.color = Color.parseColor("#F5EED7")
    when (pose) {
      Pose.ASKING -> {
        val open = if (moving) (0.5f + 0.5f * sin(now / 140.0).toFloat()) else 0.4f
        canvas.drawOval(cx - w * .05f, mouthY - h * .01f, cx + w * .05f, mouthY + h * (.015f + .04f * open), paint)
      }
      Pose.THINKING -> { paint.strokeWidth = w * .025f; paint.strokeCap = Paint.Cap.ROUND; canvas.drawLine(cx - w * .04f, mouthY + h * .02f, cx + w * .04f, mouthY + h * .02f, paint) }
      else -> {
        paint.style = Paint.Style.STROKE; paint.strokeWidth = w * .025f; paint.strokeCap = Paint.Cap.ROUND
        val wide = if (pose == Pose.HAPPY) .09f else .06f
        canvas.drawArc(cx - w * wide, mouthY - h * .04f, cx + w * wide, mouthY + h * .05f, 20f, 140f, false, paint)
        paint.style = Paint.Style.FILL
      }
    }

    // Arm and microphone.
    val shoulderX = cx + dir * (right - left) * .5f
    val shoulderY = top + h * .52f
    paint.style = Paint.Style.STROKE
    paint.strokeCap = Paint.Cap.ROUND
    paint.strokeWidth = w * .07f
    paint.color = Color.parseColor("#3F6149")
    when (pose) {
      Pose.ASKING -> {
        // Small mic held up to its own mouth.
        val micX = cx + dir * w * .13f; val micY = mouthY + h * .03f
        canvas.drawLine(shoulderX, shoulderY, micX + dir * w * .05f, micY + h * .1f, paint)
        drawMic(canvas, micX, micY, w * .045f, -dir * 35f)
      }
      Pose.LISTENING -> {
        // Mic turned toward the user, held out in front, with sound rings.
        val micX = cx + dir * w * .24f; val micY = top + h * .5f
        canvas.drawLine(shoulderX, shoulderY, micX, micY + h * .1f, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = w * .018f
        for (ring in 0 until 3) {
          val phase = if (moving) ((now / 900f + ring / 3f) % 1f) else (ring + 1) / 4f
          paint.color = Color.argb((180 * (1 - phase)).toInt(), 0x34, 0x5D, 0x45)
          val r = w * (.08f + .14f * phase)
          canvas.drawCircle(micX, micY - h * .02f, r, paint)
        }
        drawMic(canvas, micX, micY, w * .075f, dir * 20f)
      }
      Pose.THINKING, Pose.HAPPY -> {
        val micX = shoulderX + dir * w * .02f; val micY = shoulderY + h * .2f
        canvas.drawLine(shoulderX, shoulderY, micX, micY, paint)
        drawMic(canvas, micX, micY - h * .02f, w * .04f, dir * 160f)
      }
    }
    paint.style = Paint.Style.FILL
    if (pose == Pose.THINKING) {
      for (dot in 0 until 3) {
        val lift = if (moving) max(0f, sin((now / 220.0) - dot).toFloat()) * h * .04f else 0f
        paint.color = Color.parseColor("#203C31")
        canvas.drawCircle(cx - w * .08f + dot * w * .08f, top - h * .17f - lift, w * .022f, paint)
      }
    }
    canvas.restore()
    if (isAttachedToWindow && moving) postInvalidateDelayed(40)
  }

  /** A handheld mic: round grille head on a short handle, rotated around its head. */
  private fun drawMic(canvas: Canvas, x: Float, y: Float, radius: Float, rotation: Float) {
    canvas.save()
    canvas.rotate(rotation, x, y)
    paint.style = Paint.Style.FILL
    paint.color = Color.parseColor("#2E3A33")
    canvas.drawRoundRect(x - radius * .45f, y + radius * .6f, x + radius * .45f, y + radius * 2.6f, radius * .4f, radius * .4f, paint)
    paint.color = Color.parseColor("#5E6B63")
    canvas.drawCircle(x, y, radius, paint)
    paint.color = Color.parseColor("#9AA79F")
    canvas.drawCircle(x - radius * .3f, y - radius * .3f, radius * .3f, paint)
    canvas.restore()
  }
}
