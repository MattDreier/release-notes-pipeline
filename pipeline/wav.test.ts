import { describe, expect, it } from "vitest";
import { pcmToWav } from "./wav";

describe("pcmToWav", () => {
  const pcm = Buffer.alloc(2400 * 2); // 0.1s of 16-bit mono @ 24kHz
  const wav = pcmToWav(pcm);

  it("produces a RIFF/WAVE header", () => {
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
  });

  it("has correct sizes", () => {
    expect(wav.length).toBe(44 + pcm.length);
    expect(wav.readUInt32LE(4)).toBe(36 + pcm.length); // RIFF chunk size
    expect(wav.readUInt32LE(40)).toBe(pcm.length); // data chunk size
  });

  it("encodes format fields (PCM, mono, 24kHz, 16-bit)", () => {
    expect(wav.readUInt16LE(20)).toBe(1); // PCM
    expect(wav.readUInt16LE(22)).toBe(1); // channels
    expect(wav.readUInt32LE(24)).toBe(24000); // sample rate
    expect(wav.readUInt32LE(28)).toBe(48000); // byte rate = 24000*1*2
    expect(wav.readUInt16LE(34)).toBe(16); // bit depth
  });
});
