// Setup check for the practice client and the call coach.
// Run from the repo folder:  bun practice/setup.ts
// It checks each thing the two apps need, makes your profile if it is missing,
// and ends with one line: SETUP CHECK: PASS or SETUP CHECK: FAIL.
// It never prints your Deepgram key.

import { existsSync, readFileSync, copyFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
let failed = 0;
const ok = (msg: string): void => console.log(`  PASS  ${msg}`);
const warn = (msg: string): void => console.log(`  NOTE  ${msg}`);
const bad = (msg: string, fix: string): void => { failed++; console.log(`  FAIL  ${msg}\n        Fix: ${fix}`); };

console.log("\nDiscovery practice: setup check\n");

// 1. Bun
const [major, minor] = Bun.version.split(".").map(Number);
if (major > 1 || (major === 1 && minor >= 1)) ok(`bun ${Bun.version}`);
else bad(`bun ${Bun.version} is too old`, "run: bun upgrade");

// 2. Claude Code, logged in. The clients, the coach cards and the debriefs all run on it.
const claude = existsSync(join(homedir(), ".local", "bin", "claude")) ? join(homedir(), ".local", "bin", "claude") : Bun.which("claude");
if (!claude) {
  bad("Claude Code (the `claude` command) is not installed", "install it from https://claude.com/claude-code, then run `claude` once and log in");
} else {
  const proc = Bun.spawn([claude, "-p", "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--output-format", "json", "Reply with the word OK only."], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  let reply: { result?: string; is_error?: boolean } = {};
  try { reply = JSON.parse(out) as typeof reply; } catch { /* reported below */ }
  if (reply.result && !reply.is_error) ok("Claude Code answers (logged in)");
  else bad("Claude Code did not answer", "run `claude` once in a terminal and log in, then run this check again");
}

// 3. Deepgram key: the client's voice, and the coach's fast ears.
function deepgramKey(): string {
  if (process.env.DEEPGRAM_API_KEY) return process.env.DEEPGRAM_API_KEY.trim();
  for (const file of [join(ROOT, ".env"), join(ROOT, "practice", ".env"), join(ROOT, "coach", ".env"), join(homedir(), ".claude", ".env")]) {
    if (!existsSync(file)) continue;
    const m = readFileSync(file, "utf8").match(/^(?:export\s+)?DEEPGRAM_API_KEY=(.*)$/m);
    const key = m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
    if (key) return key;
  }
  return "";
}
const key = deepgramKey();
if (!key) {
  bad("No Deepgram key found", `make a free key at https://console.deepgram.com, then put one line in ${join(ROOT, ".env")}: DEEPGRAM_API_KEY=your-key`);
} else {
  const res = await fetch("https://api.deepgram.com/v1/speak?model=aura-2-thalia-en", {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ text: "Hi." }),
  }).catch(() => null);
  if (res?.ok) ok("Deepgram key works (the client can speak)");
  else bad(`Deepgram refused the key${res ? ` (${res.status})` : " (no internet?)"}`, "check the key in your .env file, or make a new one at https://console.deepgram.com");
}

// 4. Your profile: who you are, who introduces clients, your market.
const PROFILE = join(ROOT, "practice", "profile.json");
if (!existsSync(PROFILE)) {
  copyFileSync(join(ROOT, "practice", "profile.example.json"), PROFILE);
  bad("No profile yet, so I made one from the example", `open ${PROFILE} and put in your name, town, background, who refers clients to you, and your market. Or ask your AI agent to interview you and fill it in`);
} else {
  try {
    const p = JSON.parse(readFileSync(PROFILE, "utf8")) as { name?: string; market?: string; places?: string[] };
    if (!p.name || !p.market || !p.places?.length) bad("Your profile is missing a name, market or places", `fill those in: ${PROFILE}`);
    else if (p.name === "Sam" && p.market.includes("north of England")) bad("Your profile is still the example (Sam in Manchester)", `make it yours: ${PROFILE}`);
    else ok(`Profile: ${p.name}, ${p.places.length} places to draw clients from`);
  } catch {
    bad("Your profile is not valid JSON", `fix the commas and quotes in ${PROFILE}, or ask your AI agent to fix it`);
  }
}

// 5. Nice to have: Chrome (both pages need it), local Whisper (Mac only, optional).
if (platform() === "darwin") {
  if (existsSync("/Applications/Google Chrome.app")) ok("Google Chrome is installed");
  else warn("Google Chrome not found in Applications. Both pages need Chrome for the mic and the call's sound.");
  if (existsSync(join(homedir(), ".local", "bin", "mlx_whisper"))) ok("Local Whisper is installed (optional)");
  else warn("Local Whisper is not installed. That is fine: pick 'Deepgram only' in the coach. To add it: uv tool install mlx-whisper");
} else {
  warn("Not a Mac: use Chrome, and pick 'Deepgram only' in the coach (local Whisper is Mac only).");
}

console.log(failed ? `\nSETUP CHECK: FAIL (${failed} to fix, see above)\n` : "\nSETUP CHECK: PASS\n\nStart:  bun practice/server.ts   then open http://localhost:4517\nCoach:  bun coach/server.ts      then open http://localhost:4518\n");
process.exit(failed ? 1 : 0);
