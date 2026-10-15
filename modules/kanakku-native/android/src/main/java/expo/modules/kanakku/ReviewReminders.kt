package expo.modules.kanakku

import android.content.Context
import android.app.NotificationManager
import androidx.work.*
import java.util.Calendar
import java.util.concurrent.TimeUnit

object ReviewReminders {
  internal val guard=Any()
  private const val work = "kanakku-review-reminder"
  fun muted(c:Context):Boolean {
    val p=c.getSharedPreferences("kanakku-settings",Context.MODE_PRIVATE)
    val now=Calendar.getInstance()
    return p.getBoolean("quietEnabled",false) && ReviewPolicy.quiet(now.get(Calendar.HOUR_OF_DAY)*60+now.get(Calendar.MINUTE),p.getInt("quietStart",1320),p.getInt("quietEnd",480))
  }
  fun settings(c:Context):Map<String,Any> {
    val p=c.getSharedPreferences("kanakku-settings",Context.MODE_PRIVATE)
    return mapOf("notifications" to p.getBoolean("reviewNotifications",true),"quietEnabled" to p.getBoolean("quietEnabled",false),"quietStart" to p.getInt("quietStart",1320),"quietEnd" to p.getInt("quietEnd",480),"reminder" to p.getBoolean("reviewReminder",false),"reminderTime" to p.getInt("reminderTime",1140))
  }
  fun save(c:Context,notifications:Boolean,quiet:Boolean,start:Int,end:Int,reminder:Boolean,time:Int)=synchronized(guard) {
    require(start in 0..1439 && end in 0..1439 && time in 0..1439 && (!quiet || start!=end)) {"Choose valid, different quiet-hour times."}
    c.getSharedPreferences("kanakku-settings",Context.MODE_PRIVATE).edit().putBoolean("reviewNotifications",notifications).putBoolean("quietEnabled",quiet).putInt("quietStart",start).putInt("quietEnd",end).putBoolean("reviewReminder",reminder).putInt("reminderTime",time).commit()
    if(!notifications) c.getSystemService(NotificationManager::class.java).cancel(41)
    schedule(c)
  }
  fun schedule(c:Context)=synchronized(guard) {
    val p=c.getSharedPreferences("kanakku-settings",Context.MODE_PRIVATE)
    val wm=WorkManager.getInstance(c)
    val token=java.util.UUID.randomUUID().toString()
    p.edit().putString("reminderToken",token).commit()
    wm.cancelUniqueWork(work)
    if(!p.getBoolean("reviewReminder",false)||!p.getBoolean("reviewNotifications",true))return@synchronized
    val now=System.currentTimeMillis();val minute=p.getInt("reminderTime",1140)
    val next=Calendar.getInstance().apply {set(Calendar.HOUR_OF_DAY,minute/60);set(Calendar.MINUTE,minute%60);set(Calendar.SECOND,0);set(Calendar.MILLISECOND,0);if(timeInMillis<=now)add(Calendar.DAY_OF_YEAR,1)}
    val request=OneTimeWorkRequestBuilder<ReviewReminderWorker>().setInputData(workDataOf("token" to token)).setInitialDelay(next.timeInMillis-now,TimeUnit.MILLISECONDS).build()
    wm.enqueueUniqueWork(work,ExistingWorkPolicy.REPLACE,request)
  }
}
class ReviewReminderWorker(c:Context,p:WorkerParameters):Worker(c,p) {
  override fun doWork():Result=synchronized(ReviewReminders.guard) {
    val c=applicationContext;val p=c.getSharedPreferences("kanakku-settings",Context.MODE_PRIVATE)
    val token=inputData.getString("token")
    if(token==null||token!=p.getString("reminderToken",null))return@synchronized Result.success()
    if(p.getBoolean("reviewReminder",false)&&p.getBoolean("reviewNotifications",true)&&!ReviewReminders.muted(c)&&Vault(c).ready()&&(p.getInt("ledgerReviewCount",0)>0||Vault(c).pendingReviewCount()>0)) {
      runCatching {c.getSystemService(NotificationManager::class.java).notify(41,Prompts.notification(c))}
    }
    // APPEND keeps the current worker intact and schedules the next local-calendar occurrence.
    if(p.getBoolean("reviewReminder",false)&&p.getBoolean("reviewNotifications",true)) {
      val now=System.currentTimeMillis();val minute=p.getInt("reminderTime",1140)
      val next=Calendar.getInstance().apply{set(Calendar.HOUR_OF_DAY,minute/60);set(Calendar.MINUTE,minute%60);set(Calendar.SECOND,0);set(Calendar.MILLISECOND,0);if(timeInMillis<=now)add(Calendar.DAY_OF_YEAR,1)}
      WorkManager.getInstance(c).enqueueUniqueWork("kanakku-review-reminder",ExistingWorkPolicy.APPEND_OR_REPLACE,OneTimeWorkRequestBuilder<ReviewReminderWorker>().setInputData(workDataOf("token" to token)).setInitialDelay(next.timeInMillis-now,TimeUnit.MILLISECONDS).build())
    }
    Result.success()
  }
}
