package expo.modules.vestacallaudio

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Vesta L: the Android half of the hands-free session (iOS uses voiceChat mode). A voice
// conversation puts the phone in call mode, so Android's echo canceller runs on the voice-call
// microphone and recognises the agent's voice (played as call audio) as the thing to remove.
// Audio goes to a connected headset if there is one, otherwise to the loudspeaker.
class VestaCallAudioModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var previousMode: Int? = null

  override fun definition() = ModuleDefinition {
    Name("VestaCallAudio")

    AsyncFunction("setHandsFreeSessionActiveAsync") { active: Boolean ->
      val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      if (active) {
        if (previousMode == null) previousMode = audio.mode
        audio.mode = AudioManager.MODE_IN_COMMUNICATION
        route(audio)
      } else {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          audio.clearCommunicationDevice()
        } else {
          @Suppress("DEPRECATION")
          audio.isSpeakerphoneOn = false
        }
        audio.mode = previousMode ?: AudioManager.MODE_NORMAL
        previousMode = null
      }
      Unit
    }
  }

  private fun route(audio: AudioManager) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val devices = audio.availableCommunicationDevices
      val preferred = listOf(
        AudioDeviceInfo.TYPE_BLE_HEADSET,
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_USB_HEADSET,
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
      )
      val target = preferred.firstNotNullOfOrNull { type -> devices.firstOrNull { it.type == type } }
      if (target != null) audio.setCommunicationDevice(target)
    } else {
      @Suppress("DEPRECATION")
      audio.isSpeakerphoneOn = !audio.isWiredHeadsetOn && !audio.isBluetoothScoOn
    }
  }
}
