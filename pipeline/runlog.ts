import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

/**
 * Run ledger — one JSON record per generate run, capturing what the editorial
 * loop actually did: every cycle's full draft, the gate verdicts that bounced
 * it, per-pass wall-clock, and (post-TTS) estimated vs. actual narration
 * seconds. The loop's stderr told the story of five consecutive live failures
 * once — and evaporated with the terminal. This file is that story, retained.
 *
 * Two consumers:
 *  - ops: "why was this run slow / why did it fail / how many cycles?"
 *  - eval: retained drafts are the substrate for offline quality judgment
 *    (blind explain-back, cycle-over-cycle delta) — see `bun run eval`.
 */

export type GateResults = {
  runtime: boolean;
  pacing: boolean;
  schema: boolean;
  critic: boolean;
};

/** Agent-written content of one cycle's draft — the same scope the critic judges. */
export type DraftSnapshot = {
  cover: { script: string };
  slides: unknown[];
  outro: { script: string };
};

export type AttemptRecord = {
  attempt: number; // 0-based
  safeMode: boolean;
  slideCount: number;
  slideTypes: string[];
  estimatedSeconds: number; // total narration at the calibrated pace
  gates: GateResults;
  criticNotes: string[];
  draft: DraftSnapshot;
  /** Wall-clock per agent pass, milliseconds. */
  passMs: { editor: number; copywriter: number; voiceover: number; critic: number };
};

export type RunRecord = {
  repo: string;
  pr: number;
  config: { product: string; version: string; voice: string; ttsModel: string };
  startedAt: string;
  finishedAt: string;
  outcome:
    | { status: "converged"; attempts: number; version: string }
    | { status: "exhausted"; attempts: number; finalNotes: string[] };
  attempts: AttemptRecord[];
  /** Present when TTS ran: the estimator's self-audit against real audio. */
  tts?: {
    estimatedSeconds: number;
    actualSeconds: number;
    clips: { file: string; seconds: number }[];
  };
};

/** Thrown by generateManifest when all attempts are exhausted; carries the
 * per-cycle records so the ledger can persist the failed run's full history.
 *
 * It also carries the salvageable changelog inputs from the last attempt.
 * The video is what fails to converge — the technical bullets come straight
 * from the diff-grounded editor pass and never depend on the critic gate, so
 * a PR whose video is withheld can still ship its CHANGELOG entry rather than
 * vanishing from the record entirely. `technical` is empty only if the run
 * died before the first editor pass produced a plan. */
export class GenerationExhausted extends Error {
  constructor(
    message: string,
    public readonly attempts: AttemptRecord[],
    public readonly finalNotes: string[],
    public readonly technical: { category: string; bullet: string }[] = [],
    public readonly version: string = "",
  ) {
    super(message);
    this.name = "GenerationExhausted";
  }
}

/** Duration of a PCM WAV file from its header (RIFF: byte rate at offset 28,
 * then the `data` chunk's byte length). No decoder dependency needed. */
export function wavDurationSeconds(buf: Buffer): number {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("not a RIFF/WAVE file");
  }
  const byteRate = buf.readUInt32LE(28);
  if (byteRate === 0) throw new Error("WAV header has zero byte rate");
  // Walk chunks from offset 12 to find `data` (fmt may be followed by others).
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") return size / byteRate;
    off += 8 + size + (size % 2); // chunks are word-aligned
  }
  throw new Error("WAV file has no data chunk");
}

export async function measureClips(paths: string[]): Promise<{ file: string; seconds: number }[]> {
  const out: { file: string; seconds: number }[] = [];
  for (const p of paths) {
    out.push({ file: basename(p), seconds: wavDurationSeconds(await readFile(p)) });
  }
  return out;
}

/** Persist a run record to <root>/runs/, named for grepability:
 * runs/2026-07-16T17-30-00Z-pr230.json */
export async function writeRunRecord(root: string, record: RunRecord): Promise<string> {
  const dir = join(root, "runs");
  await mkdir(dir, { recursive: true });
  const stamp = record.startedAt.replace(/:/g, "-").replace(/\.\d+Z$/, "Z");
  const path = join(dir, `${stamp}-pr${record.pr}.json`);
  await writeFile(path, JSON.stringify(record, null, 2));
  return path;
}
