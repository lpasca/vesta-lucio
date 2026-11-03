import { Directory, File, Paths } from "expo-file-system";

// Poor connection mode: fetch a whole reply's audio to the cache before it plays, retrying a
// dropped download, so the speaker plays from a local file the signal can no longer cut.
const ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

let counter = 0;

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// Resolves the local file uri, or null when every attempt failed or the play was aborted.
export async function downloadReplyAudio(
  url: string,
  signal: AbortSignal,
): Promise<string | null> {
  const directory = new Directory(Paths.cache, "voice-burst");
  directory.create({ intermediates: true, idempotent: true });
  // Keep only the newest few files: a reply is played once.
  try {
    const old = directory.list().filter((entry) => entry instanceof File);
    for (const entry of old.slice(0, Math.max(0, old.length - 4)))
      (entry as File).delete();
  } catch {
    // A cleanup failure never blocks playback.
  }
  counter += 1;
  const destination = new File(directory, `reply-${Date.now()}-${counter}`);
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    if (signal.aborted) return null;
    try {
      const file = await File.downloadFileAsync(url, destination, {
        idempotent: true,
      });
      if (file.size && file.size > 0) return file.uri;
    } catch {
      // Dropped link or a server error: wait and try the same url again.
    }
    if (attempt < ATTEMPTS) await wait(RETRY_DELAY_MS * attempt, signal);
  }
  return null;
}
