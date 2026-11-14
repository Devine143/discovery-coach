// Smoke test for the call coach without a real call: speaks a short scripted call
// with the Mac's own voices, plays it into the running server at real speed, and prints
// what comes back. Run the server first, then: bun coach/test-feed.ts [local|deepgram|both]

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Who = "you" | "client";
const engine = (process.argv[2] ?? "local") as "local" | "deepgram" | "both";
const TMP = "/private/tmp/caic-call-coach/test";
mkdirSync(TMP, { recursive: true });

const CALL: { who: Who; voice: string; text: string }[] = [
  { who: "you", voice: "Daniel", text: "Thanks for making the time, Thandi. What made you book this call?" },
  { who: "client", voice: "Samantha", text: "We need an AI chatbot on our website to answer customer questions. The office is drowning." },
  { who: "you", voice: "Daniel", text: "What would that fix for you?" },
  { who: "client", voice: "Samantha", text: "The phone never stops ringing. Most of the calls are people asking where their delivery is, and my two office ladies cannot keep up." },
  { who: "you", voice: "Daniel", text: "In a normal week, how many of those delivery calls come in?" },
  { who: "client", voice: "Samantha", text: "About sixty a week. And when they cannot get through they cancel. We lose maybe four orders a week, about three thousand rand each." },
];

async function speak(index: number, voice: string, text: string): Promise<Int16Array> {
  const aiff = join(TMP, `${index}.aiff`);
  const raw = join(TMP, `${index}.raw`);
  await Bun.spawn(["say", "-v", voice, "-o", aiff, text], { stdin: "ignore" }).exited;
  await Bun.spawn(["ffmpeg", "-y", "-loglevel", "error", "-i", aiff, "-ar", "16000", "-ac", "1", "-f", "s16le", raw], { stdin: "ignore" }).exited;
  const bytes = readFileSync(raw);
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength - (bytes.byteLength % 2)));
}

const clips = await Promise.all(CALL.map((line, i) => speak(i, line.voice, line.text)));
// The server only accepts its own page, so the test says it is that page.
const Sock = WebSocket as unknown as new (url: string, options: { headers: Record<string, string> }) => WebSocket;
const ws = new Sock("ws://127.0.0.1:4518/ws", { headers: { Origin: "http://localhost:4518" } });
const started = Date.now();
const stamp = (): string => `${((Date.now() - started) / 1000).toFixed(1).padStart(5)}s`;
let debriefed = false;

ws.addEventListener("message", (event: MessageEvent) => {
  const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
  if (msg.type === "interim") return;
  if (msg.type === "final") console.log(`${stamp()} [${msg.engine}] ${msg.who}: ${msg.text}  (${(Number(msg.lagMs) / 1000).toFixed(1)}s behind)`);
  else console.log(`${stamp()} ${JSON.stringify(msg)}`);
  if (msg.type === "debrief") {
    debriefed = true;
    ws.close();
  }
});

await new Promise((resolve) => ws.addEventListener("open", resolve));
ws.send(JSON.stringify({ type: "start", engine, primary: engine === "deepgram" ? "deepgram" : "local", mode: "practice", label: "smoke test", context: "Thandi runs a furniture delivery business.", referral: "Priya", asked: "an AI chatbot on the website" }));

const FRAME = 1600;
const quiet = new Int16Array(FRAME);
const frame = (who: Who, pcm: Int16Array): Uint8Array => {
  const out = new Uint8Array(1 + pcm.byteLength);
  out[0] = who === "client" ? 1 : 0;
  out.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 1);
  return out;
};

// Both channels run all the time, like a real call: the speaker's words on one, quiet on the other.
for (let i = 0; i < CALL.length; i++) {
  const clip = clips[i];
  const other: Who = CALL[i].who === "you" ? "client" : "you";
  const total = Math.ceil(clip.length / FRAME) + 12; // 1.2 s pause after each line
  for (let f = 0; f < total; f++) {
    const part = clip.subarray(f * FRAME, (f + 1) * FRAME);
    const padded = new Int16Array(FRAME);
    padded.set(part);
    ws.send(frame(CALL[i].who, f * FRAME < clip.length ? padded : quiet));
    ws.send(frame(other, quiet));
    await Bun.sleep(100);
  }
}

console.log(`${stamp()} script finished, waiting for the coach`);
await Bun.sleep(30000);
ws.send(JSON.stringify({ type: "stop" }));
await Bun.sleep(60000);
if (!debriefed) console.log("No debrief arrived within 60 s.");
process.exit(debriefed ? 0 : 1);
