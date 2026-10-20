package expo.modules.kanakku

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

object LendingReminders {
  private const val channel = "lending-reminders"
  private fun work(id: String) = "kanakku-lending-$id"

  fun schedule(context: Context, id: String, dueAt: Long): Boolean {
    require(id.matches(Regex("[A-Za-z0-9_-]{1,100}"))) { "Invalid reminder reference." }
    if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
    require(dueAt > System.currentTimeMillis()) { "Choose a future return date." }
    val request = OneTimeWorkRequestBuilder<LendingReminderWorker>()
      .setInputData(Data.Builder().putString("id", id).build())
      .setInitialDelay(dueAt - System.currentTimeMillis(), TimeUnit.MILLISECONDS)
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork(work(id), ExistingWorkPolicy.REPLACE, request)
    return true
  }

  fun cancel(context: Context, id: String) {
    if (id.matches(Regex("[A-Za-z0-9_-]{1,100}"))) WorkManager.getInstance(context).cancelUniqueWork(work(id))
  }

  fun show(context: Context, id: String) {
    if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    val manager = context.getSystemService(android.app.NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(android.app.NotificationChannel(channel, "Money lent reminders", android.app.NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Reminders you set for money lent" })
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val pending = intent?.let { PendingIntent.getActivity(context, id.hashCode(), it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) }
    val notification = NotificationCompat.Builder(context, channel)
      .setSmallIcon(R.drawable.ic_stat_kanakku)
      .setContentTitle("Money lent reminder")
      .setContentText("A return date you set is today. Open Kanakku to review it.")
      .setAutoCancel(true)
      .setContentIntent(pending)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .build()
    runCatching { NotificationManagerCompat.from(context).notify(8000 + (id.hashCode() and 0x7fff), notification) }
  }
}

class LendingReminderWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val id = inputData.getString("id") ?: return Result.success()
    LendingReminders.show(applicationContext, id)
    return Result.success()
  }
}
