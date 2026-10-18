package expo.modules.vestavoiceservice

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

// A microphone-type foreground service: the only way Android keeps the
// microphone available while the app is backgrounded or the screen is locked.
// Started and stopped by VestaVoiceServiceModule around a hands-free voice
// session; the notification is the mandatory user-visible marker.
class VoiceForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Voice session"
    val body = intent?.getStringExtra(EXTRA_BODY) ?: "Listening"

    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Voice", NotificationManager.IMPORTANCE_LOW)
    )

    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(body)
      // Fork fix: the launcher icon is an adaptive icon, which Android rejects as a notification
      // small icon ("Bad notification for startForeground"), killing the app the moment a voice
      // conversation starts. A plain system microphone drawable is always valid.
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setOngoing(true)
      .build()

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        )
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (error: RuntimeException) {
      // Android 12+ refuses some foreground starts (background start, missing microphone grant);
      // without the service the conversation still works while the app is on screen.
      stopSelf()
    }
    return START_NOT_STICKY
  }

  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    private const val CHANNEL_ID = "vesta-voice-session"
    private const val NOTIFICATION_ID = 4001
  }
}
