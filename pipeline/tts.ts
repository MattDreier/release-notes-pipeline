import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { RepoConfig } from "./config";
import type { Manifest } from "./manifest";
import { pcmToWav } from "./wav";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
type TtsCfg = { model: string; voice: string; apiKey: string; fetchImpl?: FetchLike };

export async function synthesize(
  text: string,
  { model, voice, apiKey, fetchImpl = fetch }: TtsCfg,
): Promise<Buffer> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetchImpl(url, {
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
