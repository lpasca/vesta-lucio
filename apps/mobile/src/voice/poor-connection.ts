import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Poor connection mode: a device-local voice preference (not an agent setting, since it
// describes this phone's link, not the agent). Off = live streaming both ways. On = replies
// download whole before they play, so a drop mid-reply only delays it.
const KEY = "vesta-l.voice.poor-connection";

let current = false;
let loaded = false;
const listeners = new Set<(value: boolean) => void>();

function publish(value: boolean): void {
  current = value;
  for (const listener of listeners) listener(value);
}

// Read once at startup; every later read is the in-memory value.
export function loadPoorConnection(): Promise<boolean> {
  if (loaded) return Promise.resolve(current);
  return AsyncStorage.getItem(KEY)
    .then((stored) => {
      loaded = true;
      publish(stored === "on");
      return current;
    })
    .catch(() => current);
}

export function poorConnectionEnabled(): boolean {
  return current;
}

export function setPoorConnection(value: boolean): void {
  publish(value);
  void AsyncStorage.setItem(KEY, value ? "on" : "off").catch(() => undefined);
}

export function usePoorConnection(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(current);
  useEffect(() => {
    listeners.add(setValue);
    void loadPoorConnection();
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  const set = useCallback((next: boolean) => setPoorConnection(next), []);
  return [value, set];
}
