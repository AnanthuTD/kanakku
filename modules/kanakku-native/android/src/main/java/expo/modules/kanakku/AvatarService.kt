package expo.modules.kanakku

import android.app.*
import android.content.*
import android.graphics.*
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.*
import android.media.AudioManager
import android.content.res.Configuration
import android.provider.Settings
import android.view.*
import android.widget.*
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import kotlin.math.*

object Prompts {
  const val CHANNEL = "kanakku-review"
  /** Settings preview id: the real overlay with sample text, never a stored payment. */
  const val PREVIEW_ID = "preview"
  val BRAND = Color.parseColor("#345D45")
  private val previewHandler = Handler(Looper.getMainLooper())
  private var previewPoll: Runnable? = null
  /**
   * Shows the floating prompt once the user leaves Kanakku (within 30 seconds), so the
   * overlay, dragging, Later and sounds can be tried without a bank SMS.
   */
  fun preview(context: Context): String {
    if(!Settings.canDrawOverlays(context)) return "permission"
    val app = context.applicationContext
    previewHandler.post {
      previewPoll?.let { previewHandler.removeCallbacks(it) }
      val deadline = SystemClock.uptimeMillis() + 30_000
      val poll = object : Runnable {
        override fun run() {
          val unlocked = !app.getSystemService(KeyguardManager::class.java).isKeyguardLocked && app.getSystemService(PowerManager::class.java).isInteractive
          if(!KanakkuModule.foreground && unlocked) {
            previewPoll = null
            runCatching { AvatarWindow.show(app, PREVIEW_ID, 25_000, "Sample Store"); app.startForegroundService(Intent(app, AvatarService::class.java)) }.onFailure { AvatarWindow.hide() }
          } else if(SystemClock.uptimeMillis() < deadline) previewHandler.postDelayed(this, 300)
          else previewPoll = null
        }
      }
      previewPoll = poll
      previewHandler.postDelayed(poll, 300)
    }
    return "scheduled"
  }
  fun open(context: Context, id: String? = null, voice:Boolean=false, photo:Boolean=false): Intent {
    val uri = Uri.parse("kanakku:///").buildUpon().appendQueryParameter("review", id ?: "next").apply {
      if(photo) appendQueryParameter("photo", "1") else if(voice) appendQueryParameter("voice", "1")
    }.build()
    return Intent(Intent.ACTION_VIEW, uri).apply { setPackage(context.packageName); addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP) }
  }
  fun channel(context: Context) { context.getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL, "Payments to review", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Private reminders for payments needing a category"; lockscreenVisibility = Notification.VISIBILITY_PRIVATE }) }
  fun notification(context: Context, floating: Boolean = false): Notification {
    channel(context)
    val intent = PendingIntent.getActivity(context, 41, open(context), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    return NotificationCompat.Builder(context, CHANNEL).setSmallIcon(R.drawable.ic_stat_kanakku).setColor(BRAND)
      .setContentTitle(if(floating) "Kanakku assistant" else "A payment needs your context")
      .setContentText(if(floating) "Tap to review. Dismiss the avatar to close." else "Open Kanakku to add a category.")
      .setContentIntent(intent).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setAutoCancel(!floating).setOngoing(floating).build()
  }
  fun show(context: Context, id: String, amount: Long? = null, merchant: String? = null) {
    val prefs = context.getSharedPreferences("kanakku-settings", Context.MODE_PRIVATE)
    val locked = context.getSystemService(KeyguardManager::class.java).isKeyguardLocked || !context.getSystemService(PowerManager::class.java).isInteractive
    Diagnostics.log("info", "prompt", "decision", mapOf("muted" to ReviewReminders.muted(context), "snoozed" to (prefs.getLong("snooze", 0) >= System.currentTimeMillis()),
      "appOpen" to KanakkuModule.foreground, "locked" to locked, "overlayAllowed" to Settings.canDrawOverlays(context), "overlayOn" to prefs.getBoolean("overlay", false),
      "notifications" to prefs.getBoolean("reviewNotifications", true)))
    if(ReviewReminders.muted(context) || prefs.getLong("snooze",0)>=System.currentTimeMillis()) return
    if(prefs.getBoolean("reviewNotifications",true)&&!KanakkuModule.foreground) runCatching { context.getSystemService(NotificationManager::class.java).notify(41, notification(context)) }
    val unlocked = !context.getSystemService(KeyguardManager::class.java).isKeyguardLocked && context.getSystemService(PowerManager::class.java).isInteractive
    if (!KanakkuModule.foreground && unlocked && Settings.canDrawOverlays(context) && prefs.getBoolean("overlay", false) && prefs.getLong("snooze",0) < System.currentTimeMillis()) {
      Handler(Looper.getMainLooper()).post {
        // A visible overlay is required before an Android 15+ background FGS launch.
        runCatching { AvatarWindow.show(context, id, amount, merchant); context.startForegroundService(Intent(context, AvatarService::class.java)) }
          .onFailure { Diagnostics.log("error", "companion", "show-failed", emptyMap(), it); AvatarWindow.hide() }
      }
    }
  }
}
class AvatarService : Service() {
  companion object {
    @Volatile private var instance: AvatarService? = null
    /** Adds the microphone type while the companion listens; null when the service is not running. */
    fun microphone(on: Boolean): Boolean? {
      val service = instance ?: return null
      return runCatching { service.foreground(on) }.onFailure { Diagnostics.log("warn", "companion", "microphone-service-refused", mapOf("on" to on), it) }.isSuccess
    }
  }
  private fun foreground(microphone: Boolean) {
    var type = if (Build.VERSION.SDK_INT >= 34) android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
    if (microphone) type = type or android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    androidx.core.app.ServiceCompat.startForeground(this, 42, Prompts.notification(this, true), type)
  }
  private val screenOff = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if(intent.action == Intent.ACTION_SCREEN_OFF) { AvatarWindow.hide(); stopSelf() }
    }
  }
  override fun onCreate() {
    super.onCreate()
    Diagnostics.install(this)
    instance = this
    ContextCompat.registerReceiver(this, screenOff, IntentFilter(Intent.ACTION_SCREEN_OFF), ContextCompat.RECEIVER_NOT_EXPORTED)
  }
  override fun onBind(intent: Intent?) = null
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    foreground(false)
    // The screen may lock between the SMS dispatch and service creation.
    if(getSystemService(KeyguardManager::class.java).isKeyguardLocked || !getSystemService(PowerManager::class.java).isInteractive) { AvatarWindow.hide(); stopSelf() }
    return START_NOT_STICKY
  }
  override fun onConfigurationChanged(newConfig: Configuration) { super.onConfigurationChanged(newConfig); AvatarWindow.reposition(this) }
  override fun onDestroy() { instance = null; runCatching { unregisterReceiver(screenOff) }; AvatarWindow.hide(); super.onDestroy() }
}
