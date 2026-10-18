import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { safeFileName, saveAndOpenDownload, uniquePath } from "./open-file";

describe("safeFileName", () => {
  it("keeps a plain name", () => {
    expect(safeFileName("report.pdf")).toBe("report.pdf");
  });
  it("drops directories and reserved characters", () => {
    expect(safeFileName("../../etc/pa:ss?wd")).toBe("pa_ss_wd");
    expect(safeFileName("C:\\Users\\x\\a.txt")).toBe("a.txt");
  });
  it("never returns an empty or hidden name", () => {
    expect(safeFileName("...")).toBe("attachment");
    expect(safeFileName(".bashrc")).toBe("bashrc");
  });
});

describe("saveAndOpenDownload", () => {
  it("writes the bytes, numbers a taken name, and opens the file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "vesta-open-"));
    await writeFile(path.join(dir, "a.txt"), "old");
    expect(await uniquePath(dir, "a.txt")).toBe(path.join(dir, "a (1).txt"));
    const opened: string[] = [];
    const file = await saveAndOpenDownload(
      dir,
      "a.txt",
      new TextEncoder().encode("new").buffer,
      (f) => {
        opened.push(f);
        return Promise.resolve("");
      },
    );
    expect(file).toBe(path.join(dir, "a (1).txt"));
    expect(await readFile(file, "utf8")).toBe("new");
    expect(opened).toEqual([file]);
  });
  it("throws when the OS cannot open the file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "vesta-open-"));
    await expect(
      saveAndOpenDownload(dir, "b.bin", new Uint8Array([1]), () =>
        Promise.resolve("no app"),
      ),
    ).rejects.toThrow("could not open");
  });
});
