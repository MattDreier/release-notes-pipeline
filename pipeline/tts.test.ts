import { describe, expect, it, vi } from "vitest";
import { synthesize } from "./tts";

const pcmBase64 = Buffer.alloc(4800).toString("base64");
const fakeResponse = {
  ok: true,
  json: async () => ({
    candidates: [
      {
        content: {
          parts: [
            { inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcmBase64 } },
          ],
        },
      },
    ],
  }),
};

describe("synthesize", () => {
  it("POSTs to the configured model with AUDIO modality and voice, returns WAV", async () => {
    const fetchImpl = vi.fn(async () => fakeResponse as unknown as Response);
    const wav = await synthesize("Hello world", {
      model: "gemini-3.1-flash-tts-preview",
      voice: "Charon",
      apiKey: "k",
      fetchImpl,
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("models/gemini-3.1-flash-tts-preview:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.responseModalities).toEqual(["AUDIO"]);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Charon");
    expect(body.contents[0].parts[0].text).toBe("Hello world");
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.length).toBe(44 + 4800);
  });

  it("throws with the API error body on non-200", async () => {
    const fetchImpl = vi.fn(
      async () => ({ ok: false, status: 429, text: async () => "quota" }) as unknown as Response,
    );
    await expect(
      synthesize("x", { model: "m", voice: "v", apiKey: "k", fetchImpl }),
    ).rejects.toThrow(/429[\s\S]*quota/);
  });
});
