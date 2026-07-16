import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { RepoConfig } from "./config";
import type { Manifest } from "./manifest";
import { pcmToWav } from "./wav";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
type TtsCfg = {
  model: string;
  voice: string;
  apiKey: string;
  fetchImpl?: FetchLike;
  sleepImpl?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// NO style prompt is prepended — deliberately. Each clip is a separate TTS
// call (per-clip audio duration is what drives Remotion's slide timing), and
// a prepended director's note gets re-interpreted independently per call,
// producing audible pace/tone/volume seams BETWEEN slides (live regression,
// 2026-07-16). The voice's bare default read is tight and consistent across
// calls; context-aware delivery comes only from sparse inline tags like
// [serious], which the model understands natively inside the script text.

/** Parse the retry delay (seconds) out of a Gemini 429 body; default 60s. */
export function parseRetryDelaySeconds(body: string): number {
  const m = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return m ? Math.ceil(Number(m[1])) + 1 : 60;
}

export async function synthesize(
  text: string,
  { model, voice, apiKey, fetchImpl = fetch, sleepImpl = defaultSleep }: TtsCfg,
): Promise<Buffer> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    });
    if (res.status !== 429 || attempt >= 3) break;
    // Free-tier rate limit (3 requests/min) — wait what the API asks, then retry.
    const wait = parseRetryDelaySeconds(await res.text());
    console.error(`  ⏳ TTS rate-limited; retrying in ${wait}s (attempt ${attempt + 1}/3)`);
    await sleepImpl(wait * 1000);
  }
  if (!res.ok) throw new Error(`Gemini TTS ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
  };
  const b64 = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error(`Gemini TTS returned no audio: ${JSON.stringify(json).slice(0, 500)}`);
  return pcmToWav(Buffer.from(b64, "base64"));
}

export async function synthesizeManifest(
  manifest: Manifest,
  config: RepoConfig,
  outDir: string,
): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  await mkdir(outDir, { recursive: true });
  const jobs: [string, string][] = [
    ["cover.wav", manifest.cover.script],
    ...manifest.slides.map((s, i): [string, string] => [`slide${i + 1}.wav`, s.script]),
    ["outro.wav", manifest.outro.script],
  ];
  const files: string[] = [];
  for (const [name, script] of jobs) {
    // sequential — avoids TTS rate limits
    const wav = await synthesize(script, { model: config.ttsModel, voice: config.voice, apiKey });
    const path = join(outDir, name);
    await Bun.write(path, wav);
    files.push(path);
    console.error(`  ♪ ${name} (${(wav.length / 48000).toFixed(1)}s)`);
  }
  return files;
}
