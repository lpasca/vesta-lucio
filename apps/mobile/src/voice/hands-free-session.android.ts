import { requireOptionalNativeModule } from "expo";

// Vesta L: call mode for a voice conversation on Android (see modules/vesta-call-audio).
interface VestaCallAudioModule {
  setHandsFreeSessionActiveAsync(active: boolean): Promise<void>;
}

const callAudio =
  requireOptionalNativeModule<VestaCallAudioModule>("VestaCallAudio");

export async function setHandsFreeSessionActive(
  active: boolean,
): Promise<void> {
  await callAudio?.setHandsFreeSessionActiveAsync(active);
}
