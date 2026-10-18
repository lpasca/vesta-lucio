import { access, writeFile } from "node:fs/promises";
import path from "node:path";

// Chat attachments open the way a mail client opens them: the bytes land in the user's Downloads
// folder under the attachment's own name (a numbered copy when that name is taken), then the OS
// opens the file with its default app. Returns the written path; throws when the open fails.

// Characters Windows refuses in a file name, plus the ASCII control range.
const RESERVED = '<>:"/\\|?*';

function scrub(name: string): string {
  let out = "";
  for (let i = 0; i < name.length; i += 1) {
    const ch = name.charAt(i);
    out += name.charCodeAt(i) < 32 || RESERVED.includes(ch) ? "_" : ch;
  }
  return out;
}

export function safeFileName(name: string): string {
  const base = scrub(path.posix.basename(name.replace(/\\/g, "/"))).trim();
  const cleaned = base.replace(/^\.+/, "");
  return cleaned.length > 0 ? cleaned.slice(0, 200) : "attachment";
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function uniquePath(
  directory: string,
  name: string,
): Promise<string> {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let candidate = path.join(directory, name);
  for (let n = 1; await exists(candidate); n += 1)
    candidate = path.join(directory, `${stem} (${String(n)})${ext}`);
  return candidate;
}

export async function saveAndOpenDownload(
  directory: string,
  name: unknown,
  data: unknown,
  open: (file: string) => Promise<string>,
): Promise<string> {
  if (typeof name !== "string") throw new Error("file name must be a string");
  let bytes: Uint8Array;
  if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
  else if (ArrayBuffer.isView(data))
    bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  else throw new Error("file data must be bytes");
  const file = await uniquePath(directory, safeFileName(name));
  await writeFile(file, bytes);
  const error = await open(file);
  if (error)
    throw new Error(`saved to ${file} but could not open it: ${error}`);
  return file;
}
