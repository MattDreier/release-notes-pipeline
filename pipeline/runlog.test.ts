import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { wavDurationSeconds, writeRunRecord, type RunRecord } from "./runlog";

/** Minimal valid PCM WAV: 44-byte canonical header + `dataBytes` of silence. */
function makeWav(byteRate: number, dataBytes: number): Buffer {
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(24000, 24); // sample rate
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

describe("wavDurationSeconds", () => {
  it("computes duration from byte rate and data-chunk size", () => {
    // 48000 B/s byte rate, 96000 data bytes ⇒ exactly 2s
    expect(wavDurationSeconds(makeWav(48000, 96000))).toBe(2);
  });

  it("rejects non-WAV buffers", () => {
    expect(() => wavDurationSeconds(Buffer.from("definitely not audio data padded to length"))).toThrow(
      /RIFF/,
    );
  });

  it("skips over non-data chunks to find the data chunk", () => {
    const base = makeWav(48000, 48000); // 1s
    // Splice an extra chunk between fmt and data.
    const extra = Buffer.alloc(8 + 4);
    extra.write("LIST", 0, "ascii");
    extra.writeUInt32LE(4, 4);
    const spliced = Buffer.concat([base.subarray(0, 36), extra, base.subarray(36)]);
    spliced.writeUInt32LE(base.readUInt32LE(4) + extra.length, 4);
    expect(wavDurationSeconds(spliced)).toBe(1);
  });
});

describe("writeRunRecord", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "runlog-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes the record under runs/ named by start time and PR", async () => {
    const record: RunRecord = {
      repo: "acme/widgets",
      pr: 42,
      config: { product: "Widgets", version: "semver", voice: "Schedar", ttsModel: "tts" },
      startedAt: "2026-07-16T17:30:00.123Z",
      finishedAt: "2026-07-16T17:35:00.000Z",
      outcome: { status: "converged", attempts: 2, version: "v1.2.3" },
      attempts: [],
    };
    const path = await writeRunRecord(dir, record);
    expect(path).toBe(join(dir, "runs", "2026-07-16T17-30-00Z-pr42.json"));
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(record);
  });
});
