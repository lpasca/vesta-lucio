import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import type { ChatMessage } from "@vesta/core";
import {
  ACTIVITY_KINDS,
  ACTIVITY_SOUNDS,
  type ActivityKind,
} from "./activity-sound-files";

// Vesta L build 12 (Lucio 9 Nov): in a voice conversation, the agent's activity is heard as a
// small sound language. Each live event type gets its own short sound; a tool still running after
// LONG_TOOL_MS starts a slow pulse until it ends. Silent while the person is talking and while the
// agent speaks. Volume and beep duration are device-local sliders in Voice settings.

const LONG_TOOL_MS = 3000;
const PULSE_EVERY_MS = 2000;
// The person counts as talking while the live transcript changed within this window.
const TALKING_HOLD_MS = 1500;

// ---- device-local settings -------------------------------------------------------------------

export interface ActivitySoundSettings {
  volume: number; // 0..100
  durationMs: number; // 20..200, step 20
}

const KEY = "vesta-l.voice.activity-sounds";
const DEFAULTS: ActivitySoundSettings = { volume: 50, durationMs: 60 };

let settings: ActivitySoundSettings = DEFAULTS;
let loaded = false;
const settingListeners = new Set<(value: ActivitySoundSettings) => void>();

function clampDuration(ms: number): number {
  const stepped = Math.round(ms / 20) * 20;
  return Math.min(200, Math.max(20, stepped));
}

function publishSettings(next: ActivitySoundSettings): void {
  settings = next;
  for (const listener of settingListeners) listener(next);
}

function loadSettings(): void {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ActivitySoundSettings>;
      publishSettings({
        volume:
          typeof parsed.volume === "number"
            ? Math.min(100, Math.max(0, parsed.volume))
            : DEFAULTS.volume,
        durationMs:
          typeof parsed.durationMs === "number"
            ? clampDuration(parsed.durationMs)
            : DEFAULTS.durationMs,
      });
    })
    .catch(() => undefined);
}

export function setActivitySoundSettings(
  patch: Partial<ActivitySoundSettings>,
): void {
  const next = {
    volume: patch.volume ?? settings.volume,
    durationMs:
      patch.durationMs === undefined
        ? settings.durationMs
        : clampDuration(patch.durationMs),
  };
  publishSettings(next);
  void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
}

export function useActivitySoundSettings(): [
  ActivitySoundSettings,
  (patch: Partial<ActivitySoundSettings>) => void,
] {
  const [value, setValue] = useState(settings);
  useEffect(() => {
    settingListeners.add(setValue);
    loadSettings();
    setValue(settings);
    return () => {
      settingListeners.delete(setValue);
    };
  }, []);
  const set = useCallback(
    (patch: Partial<ActivitySoundSettings>) => setActivitySoundSettings(patch),
    [],
  );
  return [value, set];
}

// ---- diagnostic log (Vesta L build 13) -------------------------------------------------------
// Every sound decision is kept in memory (last 400 lines) so the person can copy it from Voice
// settings and paste it into chat, no cable or logcat needed.
const soundLog: string[] = [];
function slog(message: string): void {
  const line = `${new Date().toISOString().slice(11, 23)} ${message}`;
  soundLog.push(line);
  if (soundLog.length > 400) soundLog.shift();
  console.log(`[VestaL-sound] ${line}`);
}
export function soundLogText(): string {
  return soundLog.length ? soundLog.join("\n") : "(no sound events yet: open a voice conversation first)";
}

// ---- live event bus ----------------------------------------------------------------------------

const eventListeners = new Set<(event: ChatMessage) => void>();

// Called by the chat session for every live event off the socket (history never comes here).
export function emitActivity(event: ChatMessage): void {
  for (const listener of eventListeners) listener(event);
}

function kindOf(event: ChatMessage): ActivityKind | null {
  switch (event.type) {
    case "tool_start":
      return "tool";
    case "subagent_start":
      return "subagent";
    case "thinking":
    case "assistant":
      return "thinking";
    case "notification":
      return "notify";
    case "chat":
      return "reply";
    case "error":
      return "error";
    default:
      return null;
  }
}

// ---- the player ----------------------------------------------------------------------------------

// Mounted by the voice conversation panel, so sounds exist only while a conversation is open.
export function useActivitySounds({
  speaking,
  transcript,
}: {
  speaking: boolean;
  transcript: string;
}): void {
  const [prefs] = useActivitySoundSettings();
  const playersRef = useRef<Partial<Record<ActivityKind, AudioPlayer>>>({});
  const speakingRef = useRef(speaking);
  const lastTalkRef = useRef(0);
  const prefsRef = useRef(prefs);

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);
  useEffect(() => {
    if (transcript.trim()) {
      lastTalkRef.current = Date.now();
      slog(`transcript change (${transcript.trim().length} chars)`);
    }
  }, [transcript]);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  // One player per kind, loaded with the sound at the chosen duration; rebuilt when it changes.
  useEffect(() => {
    const players: Partial<Record<ActivityKind, AudioPlayer>> = {};
    for (const kind of ACTIVITY_KINDS) {
      try {
        players[kind] = createAudioPlayer(
          ACTIVITY_SOUNDS[kind][prefs.durationMs],
        );
      } catch (error) {
        slog(`${kind} load failed: ${String(error)}`);
        // A sound that cannot load is skipped; the rest still play.
      }
    }
    playersRef.current = players;
    return () => {
      for (const player of Object.values(players)) {
        try {
          player?.remove();
        } catch {
          // Already released.
        }
      }
    };
  }, [prefs.durationMs]);

  useEffect(() => {
    const quiet = (): boolean =>
      speakingRef.current ||
      Date.now() - lastTalkRef.current < TALKING_HOLD_MS ||
      prefsRef.current.volume <= 0;

    // Vesta L build 13 (diagnostic): one log line per sound decision, tag [VestaL-sound].
    const play = (kind: ActivityKind): void => {
      const sinceTalk = Date.now() - lastTalkRef.current;
      const why = speakingRef.current
        ? "speaking"
        : sinceTalk < TALKING_HOLD_MS
          ? `talking(${sinceTalk}ms)`
          : prefsRef.current.volume <= 0
            ? "volume0"
            : "";
      if (why) {
        slog(`${kind} muted: ${why}`);
        return;
      }
      const player = playersRef.current[kind];
      if (!player) {
        slog(`${kind} no player`);
        return;
      }
      try {
        player.volume = prefsRef.current.volume / 100;
        void player.seekTo(0);
        player.play();
        slog(
          `${kind} played vol=${prefsRef.current.volume} dur=${prefsRef.current.durationMs} loaded=${String(player.isLoaded)} playing=${String(player.playing)}`,
        );
      } catch (error) {
        slog(`${kind} play failed: ${String(error)}`);
      }
    };

    // Tools still running, so a long one gets the pulse until its end arrives.
    let open = 0;
    let longTimer: ReturnType<typeof setTimeout> | undefined;
    let pulseTimer: ReturnType<typeof setInterval> | undefined;
    const stopPulse = (): void => {
      if (longTimer) clearTimeout(longTimer);
      if (pulseTimer) clearInterval(pulseTimer);
      longTimer = undefined;
      pulseTimer = undefined;
    };
    const startLongWatch = (): void => {
      if (longTimer || pulseTimer) return;
      longTimer = setTimeout(() => {
        longTimer = undefined;
        if (open <= 0) return;
        play("pulse");
        pulseTimer = setInterval(() => {
          if (open <= 0) stopPulse();
          else play("pulse");
        }, PULSE_EVERY_MS);
      }, LONG_TOOL_MS);
    };

    const onEvent = (event: ChatMessage): void => {
      slog(`event ${event.type}`);
      if (event.type === "tool_start") {
        open += 1;
        startLongWatch();
      } else if (event.type === "tool_end") {
        open = Math.max(0, open - 1);
        if (open === 0) stopPulse();
      } else if (event.type === "status" && event.state === "idle") {
        // The turn is over: nothing can still be running.
        open = 0;
        stopPulse();
      }
      const kind = kindOf(event);
      if (kind) play(kind);
    };

    eventListeners.add(onEvent);
    slog("sounds mounted (voice conversation open)");
    return () => {
      eventListeners.delete(onEvent);
      stopPulse();
    };
  }, []);

  // The agent starting to talk silences a running pulse at once.
  useEffect(() => {
    if (!speaking) return;
    for (const player of Object.values(playersRef.current)) {
      try {
        player?.pause();
      } catch {
        // Already stopped.
      }
    }
  }, [speaking]);
}
