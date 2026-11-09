import { useState, type ReactNode } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { voiceUsageSummary } from "@vesta/core";
import type { VoiceDomain, VoiceStatus } from "@vesta/core";
import { useAgent } from "@/agent/AgentProvider";
import {
  useVoiceChange,
  useVoiceUsage,
  useVoiceSettings,
  type VoiceChange,
} from "@/agent/settings/voice-actions";
import { VoiceSetting } from "@/agent/settings/voice-setting";
import { Card } from "@/components/ui/Card";
import { FormRow, SwitchRow } from "@/components/ui/Form";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { Quote, Text } from "@/components/ui/Typography";
import { usePreferences } from "@/preferences/PreferencesProvider";
import { usePoorConnection } from "@/voice/poor-connection";
import { useActivitySoundSettings } from "@/voice/activity-sounds";
import { Slider } from "@/components/ui/Slider";

// Device-local: how this phone's link should be treated, whatever the agent's voice services.
function ConnectionCard() {
  const { colors } = usePreferences();
  const [poor, setPoor] = usePoorConnection();
  return (
    <Card>
      <Text family="heading" style={[styles.title, { color: colors.text }]}>
        Connection
      </Text>
      <SwitchRow
        label="Poor connection mode"
        detail="Replies download in full before they play, so a weak or dropping signal delays a reply instead of cutting it. Off: replies stream and start sooner."
        value={poor}
        onValueChange={setPoor}
      />
    </Card>
  );
}

// Device-local: how the agent's activity sounds during a voice conversation (Vesta L build 12).
function ActivitySoundsCard() {
  const { colors } = usePreferences();
  const [sounds, setSounds] = useActivitySoundSettings();
  const [volume, setVolume] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const shownVolume = volume ?? sounds.volume;
  const shownDuration = duration ?? sounds.durationMs;
  return (
    <Card>
      <Text family="heading" style={[styles.title, { color: colors.text }]}>
        Activity sounds
      </Text>
      <FormRow
        label="Volume"
        detail="A short sound for each thing the agent does in a voice conversation: a click per command, a ping per notification, a rise when a reply goes out, a slow pulse while a long command runs. Silent while you talk and while the agent speaks. 0 turns them off."
        value={`${shownVolume}%`}
      />
      <Slider
        accessibilityLabel="Activity sound volume"
        valueText={`${shownVolume}%`}
        value={shownVolume}
        min={0}
        max={100}
        step={5}
        onChange={setVolume}
        onCommit={(next) => {
          setSounds({ volume: next });
          setVolume(null);
        }}
      />
      <FormRow
        label="Beep length"
        detail="How long each sound lasts."
        value={`${shownDuration} ms`}
      />
      <Slider
        accessibilityLabel="Activity sound length"
        valueText={`${shownDuration} ms`}
        value={shownDuration}
        min={20}
        max={200}
        step={20}
        onChange={setDuration}
        onCommit={(next) => {
          setSounds({ durationMs: next });
          setDuration(null);
        }}
      />
    </Card>
  );
}

const DOMAIN_TITLES: Record<VoiceDomain, string> = {
  stt: "Speech to text",
  tts: "Text to speech",
  judge: "Judge",
};

const ENABLED_DETAILS: Record<VoiceDomain, string> = {
  stt: "Use live transcription in chat.",
  tts: "Speak new replies when available.",
  judge: "Let the judge read your words while a reply plays.",
};

// The usage row mounts only for a role that is configured and on, so no other role asks its
// provider.
function UsageRow({
  domain,
  provider,
}: {
  domain: "stt" | "tts";
  provider: string | null;
}) {
  const usage = useVoiceUsage(domain, provider);
  return <FormRow label="Usage" value={voiceUsageSummary(usage.data)} />;
}

function DomainCard({
  domain,
  status,
  about,
  onChange,
  busy,
}: {
  domain: VoiceDomain;
  status: VoiceStatus;
  // What the role does, for a role the user must choose with care.
  about?: ReactNode;
  onChange: (change: VoiceChange, onSettled?: () => void) => void;
  busy: boolean;
}) {
  const { colors } = usePreferences();
  const title = DOMAIN_TITLES[domain];
  const connected = status.connected ?? [];
  const live = status.configured && status.enabled !== false;
  // With two or more providers connected to the role, the card offers the switch.
  const chooseProvider = () => {
    Alert.alert("Provider", `Choose who does ${title.toLowerCase()}.`, [
      ...connected.map((provider) => ({
        text: provider,
        onPress: () => onChange({ type: "provider", domain, provider }),
      })),
      { text: "Cancel", style: "cancel" },
    ]);
  };
  return (
    <Card>
      <View>
        <Text family="heading" style={[styles.title, { color: colors.text }]}>
          {title}
        </Text>
        <Text style={[styles.provider, { color: colors.secondaryText }]}>
          {status.provider ?? "not configured"}
        </Text>
      </View>
      {about ? (
        <Text style={[styles.about, { color: colors.secondaryText }]}>
          {about}
        </Text>
      ) : null}
      <SwitchRow
        label={status.configured ? "Enabled" : "Needs configuration"}
        detail={
          status.configured
            ? ENABLED_DETAILS[domain]
            : "Ask the agent to configure this voice service."
        }
        value={live}
        disabled={!status.configured || busy}
        onValueChange={(value) => onChange({ type: "enabled", domain, value })}
      />
      {live && connected.length > 1 ? (
        <FormRow
          label="Provider"
          value={status.provider ?? undefined}
          onPress={chooseProvider}
        />
      ) : null}
      {live && domain !== "judge" ? (
        <UsageRow domain={domain} provider={status.provider} />
      ) : null}
      {live
        ? (status.settings ?? []).map((setting) => (
            <VoiceSetting
              key={setting.key}
              setting={setting}
              section={domain}
              onSave={(section, key, value, onSettled) =>
                onChange(
                  { type: "setting", domain: section, key, value },
                  onSettled,
                )
              }
              busy={busy}
            />
          ))
        : null}
    </Card>
  );
}

export function VoiceSection() {
  const { name } = useAgent();
  const { settings, hasVoiceService } = useVoiceSettings();
  const change = useVoiceChange();
  const { colors } = usePreferences();
  const apply = (next: VoiceChange, onSettled?: () => void) =>
    change.mutate(next, { onSettled });

  if (!hasVoiceService) {
    return (
      <EmptyState
        title="Voice is not set up yet"
        detail={
          <>
            {name} can talk and listen once voice is set up. Just ask in chat,
            for example <Quote>“set up voice”</Quote> or{" "}
            <Quote>“let me talk to you”</Quote>.
          </>
        }
      />
    );
  }

  if (settings.isLoading) {
    return <LoadingState label="Loading voice services…" />;
  }
  if (!settings.data) {
    return (
      <ErrorState
        message={
          settings.error instanceof Error
            ? settings.error.message
            : "Voice settings are unavailable."
        }
        retry={() => void settings.refetch()}
      />
    );
  }

  const { stt, tts, judge, behaviors } = settings.data;
  return (
    <>
      <ConnectionCard />
      <ActivitySoundsCard />
      <DomainCard
        domain="stt"
        status={stt}
        busy={change.isPending}
        onChange={apply}
      />
      <DomainCard
        domain="tts"
        status={tts}
        busy={change.isPending}
        onChange={apply}
      />
      {judge ? (
        <DomainCard
          domain="judge"
          status={judge}
          about={
            <>
              While a reply plays, the judge decides who your words are for: a
              short <Quote>“stop”</Quote> cuts the reply, an{" "}
              <Quote>“mhm”</Quote> does not, and talk to another person in the
              room stays out of the conversation. While it is on, your live
              words and the line {name} is saying go to{" "}
              {judge.provider ?? "its provider"}.
            </>
          }
          busy={change.isPending}
          onChange={apply}
        />
      ) : null}
      {behaviors?.settings.length ? (
        <Card>
          <Text family="heading" style={[styles.title, { color: colors.text }]}>
            Behavior
          </Text>
          {behaviors.settings.map((setting) => (
            <VoiceSetting
              key={setting.key}
              setting={setting}
              section="behavior"
              onSave={(section, key, value, onSettled) =>
                apply(
                  { type: "setting", domain: section, key, value },
                  onSettled,
                )
              }
              busy={change.isPending}
            />
          ))}
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 19, fontWeight: "500" },
  provider: { fontSize: 13, marginTop: 2 },
  about: { fontSize: 14, lineHeight: 20 },
});
