package expo.modules.vestavoiceservice

import android.content.Context
import android.content.Intent
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VestaVoiceServiceModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("VestaVoiceService")

    AsyncFunction("startForegroundServiceAsync") { title: String, body: String ->
      val intent = Intent(context, VoiceForegroundService::class.java)
        .putExtra(VoiceForegroundService.EXTRA_TITLE, title)
        .putExtra(VoiceForegroundService.EXTRA_BODY, body)
      context.startForegroundService(intent)
      // Fork fix: startForegroundService() returns a ComponentName, which Expo cannot send to
      // JS ("Unknown type: class android.content.ComponentName"), so the call was rejected after
      // the service had already started; the app then tore voice down and stopped the service
      // before it reached the foreground, which Android punishes by killing the app.
      Unit
    }

    AsyncFunction("stopForegroundServiceAsync") {
      // Fork fix: a plain stopService() that lands before the service has run onStartCommand
      // leaves Android waiting for a startForeground() that never comes, and Android kills the
      // app (ForegroundServiceDidNotStartInTimeException). Ask the service to stop itself
      // instead: this intent queues behind any pending start, so startForeground() runs first.
      val stop = Intent(context, VoiceForegroundService::class.java)
        .setAction(VoiceForegroundService.ACTION_STOP)
      try {
        context.startService(stop)
        Unit
      } catch (error: IllegalStateException) {
        // The app is in the background and may not start services; nothing is pending then.
        context.stopService(Intent(context, VoiceForegroundService::class.java))
        Unit
      }
    }
  }
}
