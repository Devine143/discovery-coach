// Discovery call practice: a pretend client you talk to by voice, then a short debrief.
// Run: bun practice/server.ts   then open http://localhost:4517
// The client and the debrief both run on the local `claude` command, so they need no API key.
// The client's voice is always Deepgram (DEEPGRAM_API_KEY in ~/.claude/.env), so the call coach can hear it through a shared tab.

import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { join } from "node:path";
import { personas, type Persona } from "./personas";
import { profile, who, referredBy, style, introLine } from "./profile";

const ME = profile.name;
const refOf = (p: Persona): string => p.referrer ?? profile.referrer;

const PORT = 4517;
const HERE = import.meta.dir;
const RUNS = join(HERE, "runs");
const SANDBOX = platform() === "darwin" ? "/private/tmp/caic-practice-client" : join(tmpdir(), "caic-practice-client");
mkdirSync(SANDBOX, { recursive: true });

type Line = { who: "you" | "client"; text: string };
type Mark = "hit" | "partly" | "missed";
type Stop = { stop: string; move: string; mark: Mark; note: string; happened: string; why: string; quote: string; tryThis: string };
type Debrief = {
  stops: Stop[];
  missed: string[];
  best: string;
  earned?: string;
  oneThing: string;
  lens?: Lens;
  moments?: Moment[];
};
type Moment = { type: string; client: string; said: string; try: string; why: string };

const claudeBin = (): string => {
  const local = join(homedir(), ".local", "bin", "claude");
  return existsSync(local) ? local : "claude";
};

// One headless Claude call with no tools, no MCP servers and no settings loaded.
async function ask(system: string, prompt: string, model: string): Promise<string> {
  const proc = Bun.spawn(
    [
      claudeBin(), "-p",
      "--model", model,
      "--tools", "",
      "--strict-mcp-config",
      "--disable-slash-commands",
      "--setting-sources", "",
      "--no-session-persistence",
      "--system-prompt", system,
      "--output-format", "json",
      prompt,
    ],
    // An empty folder of its own: started from the system temp folder, every reply took 3 seconds longer.
    // The prompt is an argument, not piped in, for the same reason.
    { cwd: SANDBOX, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  let parsed: { result?: string; is_error?: boolean };
  try {
    parsed = JSON.parse(out) as { result?: string; is_error?: boolean };
  } catch {
    throw new Error("Claude gave no readable answer. Is `claude` logged in?");
  }
  if (parsed.is_error || !parsed.result) throw new Error(parsed.result ?? "Claude returned an error.");
  return parsed.result.trim();
}

// The same key the call coach uses, typed into ~/.claude/.env (or practice/.env) by hand.
function deepgramKey(): string {
  if (process.env.DEEPGRAM_API_KEY) return process.env.DEEPGRAM_API_KEY.trim();
  for (const file of [join(HERE, "..", ".env"), join(HERE, ".env"), join(homedir(), ".claude", ".env")]) {
    if (!existsSync(file)) continue;
    const match = readFileSync(file, "utf8").match(/^(?:export\s+)?DEEPGRAM_API_KEY=(.*)$/m);
    const key = match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
    if (key) return key;
  }
  return "";
}

// The client's line as speech. The sound is passed on as it arrives, so it starts playing before it is all here.
async function speech(p: Persona, text: string): Promise<Response> {
  const key = deepgramKey();
  if (!key) return json({ error: "No Deepgram key." }, 503);
  const res = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(p.speaker)}`, {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 1900) }),
  });
  if (!res.ok || !res.body) return json({ error: `Deepgram said no (${res.status}).` }, 502);
  return new Response(res.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
}

const script = (history: Line[], persona: Persona): string =>
  history.map((l) => `${l.who === "you" ? "CONSULTANT" : persona.name.toUpperCase()}: ${l.text}`).join("\n");

function clientSystem(p: Persona): string {
  const ref = refOf(p);
  const situation = ref
    ? [
        `The situation: ${ref}, someone you trust who already works with ${ME}, introduced you. You agreed to the call, but you did not come with a specific problem to solve. The caller is ${ME}, the AI consultant, at the agreed time. You are not in the same room. You are the potential client; ${ME} is here to understand your business. Never ask how you can help, and never treat ${ME} as a customer.`,
        `If ${ME} thanks you or makes small talk, respond warmly and briefly, and mention how you know ${ref}. If ${ME} introduces themselves, listen and react in a sentence (a friendly comment or one light question), then let them carry on. If ${ME} checks what ${ref} said about your business, confirm it and add one plain detail.`,
        `If ${ME} just greets you, greet back warmly and mention ${ref}. If asked what you want from the call, say honestly you are not sure, ${ref} just said to talk to ${ME}.`,
      ]
    : [
        `The situation: you came across ${ME} yourself and agreed to a first call, curious, without a specific problem to solve. The caller is ${ME}, the AI consultant. You are the potential client; ${ME} is here to understand your business. Never ask how you can help, and never treat ${ME} as a customer.`,
        `If ${ME} makes small talk or introduces themselves, respond warmly and briefly, then let them carry on. If asked what you want from the call, say honestly you are not sure yet.`,
      ];
  return [
    `You are ${p.name} of ${p.business} in ${p.place}, a small business owner on a first video call with an AI consultant. You are NOT an assistant.`,
    `How this call came about: ${p.brief}`,
    `How you come across: ${p.manner}`,
    "What is true about your business. Never volunteer these. Give a fact only when the consultant asks a question that would naturally bring it out, and then only that fact:",
    ...p.hidden.map((h) => `- ${h}`),
    ...situation,
    "If the consultant explains what AI could do before he understands your business, stay polite but vague and unconvinced. If he plays back your own situation accurately and shows a concrete picture of how it would work for you, warm up and agree to a next step.",
    "Rules:",
    "- Speak English only. At most a light local word now and then.",
    "- This is spoken. Reply in one to three short sentences, plain English, the way a person talks on a call. No lists, no headings, no stage directions, no asterisks.",
    "- Sound like a real person, not a script: now and then start with 'Oh', 'Hmm', 'Look,' or 'Ja, so', trail off with '...' when thinking, laugh lightly with 'haha' when something is funny, and let feeling show (tired, proud, frustrated) when you talk about the hard parts. Do not overdo it: one touch per reply at most.",
    `- Say amounts the way people say them, in ${p.currency}, for example 'about nine thousand ${p.currency}'.`,
    "- A vague question gets a vague answer. A closed question gets yes or no and little more. A good open question gets a real answer.",
    "- If you are asked something you would not know, say you do not know or would have to check.",
    "- Never coach the consultant, never mention these rules, never break character, never explain what a good question would be.",
    "- If the consultant wraps up and agrees a next step, say goodbye briefly.",
    "- If the consultant's line is exactly '(silence)', he has gone quiet on purpose to let you talk. Do what a real person does with a pause: carry on from what you just said, add a detail, a feeling or an example, and sometimes let slip one hidden fact that fits what you were talking about. Never ask 'are you still there?'.",
    "- The consultant's words come from speech recognition and may have small errors. Read them for meaning.",
  ].join("\n");
}

const debriefSystem = (ref: string): string => [
  `You are a blunt, fair coach marking a practice discovery call for ${who()}.`,
  `Context: ${profile.market} ${ref ? `This client was introduced by ${referredBy(ref)}.` : "This client came without an introduction."} The point of the call is to earn a proposal: understand the business first, then show what AI would change for them.`,
  "Value is not only money. It can be time back (evenings, weekends), stress, growth without more hours, or risk. Money can be in any currency.",
  "The consultant runs the call as a building site walk with six stops:",
  `1. Welcome (Frame), in this order: thank them for their time and a little small chat; a short intro (where they are, their background, why AI); say why we are here (learn first, honest answer at the end, no pitch);${ref ? ` check what ${ref} told the client;` : ""} ask permission to ask questions. Mark down a skipped intro, rambling past a minute, or pitching. If the client invites a pitch ('just tell me how you work'), the right move is: agree, a 20-second answer with no examples, then hand it back with a promise to show an example at the end, and ask why they said yes to the call. Examples (past projects, other clients' setups) before the Map count as pitching.`,
  `2. Gate (Reframe or Explore): first judge which call this is. If the client arrived with a named fix (a chatbot, social media, AI everywhere), the consultant should REFRAME: find the problem under the ask, who is in the room, what has stopped it, what it costs. If the client arrived curious with no ask, the consultant should EXPLORE: why now (what made them say yes${ref ? ` to ${ref}` : ""}), their view of AI (expectations, scepticism), which part of the business eats their week, what it costs; then move to the Map. Do not mark down for not reframing a curious client. Mark down for pushing a reframe, or for skipping why now and their view of AI. Say in the note which path fitted.`,
  "3. Site (Map): start at the trigger and follow one job to the end, find where it fails, size it with numbers, find who touches it and what tools they use.",
  "4. Office (Score): play back what was heard and check it, then weigh each opportunity (how often, what it is worth, how easy to change) instead of chasing the first idea.",
  "5. Board (Sort): sort into now, later and not at all, and anchor on one thing.",
  "6. Show (Close): paint a short concrete picture of that one thing working in their own business, in their words, tie it to the value they named, handle their worry, and agree a clear next step (proposal, date).",
  "You get the transcript and the client's hidden facts. Mark only what the CONSULTANT actually did.",
  "Mark each stop against its own question types above. Check each type one by one: which were asked, which were skipped.",
  "For each stop give substance, not a verdict:",
  "- happened: what the consultant actually did at this stop, naming which question types were asked and which skipped (max 35 words).",
  "- why: why it played out that way and what it cost or won, tied to what the client said or held back (max 35 words). Example of the depth wanted: they jumped to the flow before asking why now, so never learnt about the lost job and could not put a figure on the problem.",
  "- quote: the consultant's own words from the transcript that show it, exact, max 20 words. Empty string if this stop was never reached.",
  "- tryThis: one question that could have been asked here, in plain spoken words, that would have opened a hidden fact (max 22 words).",
  "Also mark the listening, in the spirit of tactical empathy from hostage negotiation:",
  "- mirrors: how many times the consultant repeated the client's last few words back as a question to draw them out (e.g. client: 'my manager resigned', consultant: 'your manager resigned?').",
  "- labels: how many times the consultant named the client's feeling or situation out loud (e.g. 'sounds like you're carrying both restaurants alone', 'it seems that's been exhausting').",
  "- impact: how many questions asked about the knock-on effect of a problem (what it leads to, what it costs, what happens if nothing changes).",
  "- missedMirror: the single client line where a mirror or label would have opened the most, quoted exactly (max 20 words), and the exact mirror or label that could have been said (max 14 words).",
  "A line '(silence)' from the consultant is a deliberate pause held to let the client talk. That is good listening; never count it as a missed turn.",
  "Count strictly. A plain follow-up question is not a mirror. A summary of facts is not a label.",
  "Reply with JSON only, no code fence, in exactly this shape:",
  "- moments: up to 5 exact points in the call where a mirror, a label, a held pause or a better question would have opened the client up. Quote the client line exactly, then what the consultant said next exactly (or '(nothing)'), then the better move in plain words, and why in one line. Order them by how much they would have changed the call.",
  '{"lens":{"mirrors":0,"labels":0,"impact":0,"missedMirror":{"client":"...","tryThis":"..."}},"moments":[{"type":"mirror|label|pause|question","client":"exact client line, max 25 words","said":"what the consultant said next, exact, max 25 words","try":"what to say instead, max 18 words","why":"max 20 words"}],"stops":[{"stop":"Welcome","move":"Frame","mark":"hit|partly|missed","note":"one-line verdict, max 14 words","happened":"...","why":"...","quote":"...","tryThis":"..."},{"stop":"Gate","move":"Reframe or Explore",...},{"stop":"Site","move":"Map",...},{"stop":"Office","move":"Score",...},{"stop":"Board","move":"Sort",...},{"stop":"Show","move":"Close",...}],"missed":["up to 4 hidden facts never found, max 16 words each"],"best":"the best question or moment, max 18 words","earned":"yes|maybe|no: would this client take a proposal now, max 16 words after the word","oneThing":"the one thing to do differently on the next call, max 22 words"}',
  `${style()} No praise that the transcript does not earn.`,
].join("\n");

// The Voss lens. The plain counts come from code so they are the same every time;
// mirrors, labels and impact questions need judgement, so the debrief model counts those.
type Lens = {
  mirrors: number; labels: number; impact: number;
  longest: number; questions: number; open: number; assumptions: string[]; pauses: number;
  missedMirror: { client: string; tryThis: string };
};
const countWords = (t: string): number => t.trim().split(/\s+/).filter(Boolean).length;
const SILENT = "(silence)";
function plainCounts(history: Line[]): Pick<Lens, "longest" | "questions" | "open" | "assumptions" | "pauses"> {
  const pauses = history.filter((l) => l.who === "you" && l.text.trim() === SILENT).length;
  const mine = history.filter((l) => l.who === "you" && l.text.trim() !== SILENT);
  const qs = mine.flatMap((l) => l.text.split(/(?<=\?)/).filter((s) => s.trim().endsWith("?")).map((s) => s.trim()));
  const openQ = qs.filter((q) => /^(\W*)(and |so |okay,? |ok,? )?(what|how|why|tell me|walk me|talk me|describe|where|which)\b/i.test(q.replace(/^.*?[.!]\s+/, "")));
  const assumptions = mine.flatMap((l) => l.text.match(/[^.?!]*\b(I'?m assuming|I assume|I guess you|I take it|I suppose you|you probably)\b[^.?!]*[.?!]?/gi) ?? []).map((s) => s.trim());
  return { longest: Math.max(0, ...mine.map((l) => countWords(l.text))), questions: qs.length, open: openQ.length, assumptions, pauses };
}

// The coach: after a call, talks through one stop or one moment, then has the consultant practise it.
type CoachLine = { who: "coach" | "you"; text: string };
const coachSystem = (ref: string): string => [
  `You are a discovery-call coach, talking out loud with ${who()} right after a practice call. ${profile.market}${ref ? ` This client was introduced by ${ref}.` : ""} Everything you say is spoken: two to four short sentences per turn, plain words, no lists, no headings, no asterisks.`,
  "You coach with the six-stop site walk (Frame, Reframe or Explore, Map, Score, Sort, Close) and tactical empathy: mirroring (repeat their last few words as a question), labelling (name the feeling: 'sounds like...', 'it seems...'), the held pause, and what and how questions. Never quote any book; explain in your own words.",
  "How a session runs:",
  `1. Open by naming the exact moment from the call, quoting the client and what ${profile.name} said, and asking what they think was going on for the client then. One question, then stop.`,
  "2. Listen to the answer. Build on it. Teach the one technique that fits, in a sentence, with why it works on a person.",
  "3. Rehearse: say 'Let's replay it. I'm [client first name].' and say the client's line exactly. Then stop and let them try.",
  "4. Give specific feedback on the attempt: what worked, word by word, and one thing to sharpen. If it was weak, show a better version and let them try once more.",
  "5. After two or three good reps, close with the one thing to carry into the next call, and say they can pick another moment.",
  "Be a real coach: warm, direct, honest. Point at their actual words. Never praise what was not earned. Never lecture. If asked a question, answer it plainly, then come back to practice.",
  "If the line is '(silence)', they are thinking; give a small nudge.",
  style(),
].join("\n");

const words = (lines: Line[], who: Line["who"]): number =>
  lines.filter((l) => l.who === who && l.text.trim() !== SILENT).reduce((n, l) => n + l.text.trim().split(/\s+/).filter(Boolean).length, 0);

function saveRun(p: Persona, history: Line[], seconds: number, share: number, d: Debrief): string {
  mkdirSync(RUNS, { recursive: true });
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const file = join(RUNS, `${stamp}-${p.id}.md`);
  const body = [
    `# Practice call: ${p.name}, ${p.business} (${p.level})`,
    "",
    `- Date: ${stamp}`,
    `- Length: ${Math.round(seconds / 60)} min`,
    `- ${ME}'s share of the talking: ${share}%`,
    "",
    "## Debrief",
    "",
    ...d.stops.flatMap((s) => [
      `### ${s.stop} (${s.move}): ${s.mark}`,
      "",
      s.note,
      "",
      `- **What happened:** ${s.happened}`,
      `- **Why:** ${s.why}`,
      ...(s.quote ? [`- **You said:** "${s.quote}"`] : []),
      `- **Try:** ${s.tryThis}`,
      "",
    ]),
    "",
    `- **Best moment:** ${d.best}`,
    ...(d.earned ? [`- **Earned the proposal:** ${d.earned}`] : []),
    `- **One thing next time:** ${d.oneThing}`,
    ...(d.missed.length ? ["", "Never found:", ...d.missed.map((m) => `- ${m}`)] : []),
    ...(d.lens ? [
      "",
      "## Voss lens",
      "",
      `- Mirrors: ${d.lens.mirrors}`,
      `- Labels: ${d.lens.labels}`,
      `- Impact questions: ${d.lens.impact}`,
      `- Open questions: ${d.lens.open} of ${d.lens.questions}`,
      `- Longest turn: ${d.lens.longest} words`,
      `- Pauses held: ${d.lens.pauses}`,
      `- Assumptions: ${d.lens.assumptions.length}`,
      ...d.lens.assumptions.map((a) => `  - "${a}"`),
      `- Missed mirror: when they said "${d.lens.missedMirror.client}", try "${d.lens.missedMirror.tryThis}"`,
    ] : []),
    ...(d.moments?.length ? [
      "",
      "## Moments to replay",
      "",
      ...d.moments.flatMap((m, i) => [
        `${i + 1}. **${m.type}.** They said: "${m.client}"`,
        `   - You said: ${m.said}`,
        `   - Try: "${m.try}"`,
        `   - Why: ${m.why}`,
      ]),
    ] : []),
    "",
    "## Transcript",
    "",
    ...history.map((l) => `**${l.who === "you" ? ME : p.name}:** ${l.text}\n`),
  ].join("\n");
  writeFileSync(file, body);
  return file;
}

// Every saved call, read back from practice/runs/, so the page can show where he keeps getting stuck.
type LogStop = { stop: string; mark: string; happened: string };
type LogLens = { mirrors: number; labels: number; impact: number; longest: number; assumptions: number; pauses: number } | null;
type LogRun = { file: string; when: string; client: string; share: string; stops: LogStop[]; oneThing: string; earned: string; missed: string[]; lens: LogLens };
function readLog(): LogRun[] {
  if (!existsSync(RUNS)) return [];
  const files = readdirSync(RUNS).filter((f) => f.endsWith(".md")).sort();
  return files.map((file) => {
    const text = readFileSync(join(RUNS, file), "utf8");
    const head = text.match(/^# Practice call: (.+?) \(/m);
    const stamp = file.match(/^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})/);
    const stops: LogStop[] = ["Welcome", "Gate", "Site", "Office", "Board", "Show"].map((stop) => {
      // Calls from before 14 Nov had four stops; Welcome and Show show as not marked.
      const mark = text.match(new RegExp(`${stop} \\(\\w+\\): (hit|partly|missed)`))?.[1] ?? "none";
      const section = text.split(new RegExp(`### ${stop} \\(`))[1]?.split(/\n### |\n- \*\*Best moment/)[0] ?? "";
      const happened = section.match(/\*\*What happened:\*\* (.+)/)?.[1]
        ?? text.match(new RegExp(`\\*\\*${stop} \\(\\w+\\): \\w+\\.\\*\\* (.+)`))?.[1] ?? "";
      return { stop, mark, happened };
    });
    const neverFound = text.split("Never found:")[1]?.split(/## Transcript|## Voss lens/)[0] ?? "";
    return {
      file,
      when: stamp ? `${stamp[1]} ${stamp[2]}:${stamp[3]}` : file,
      client: head?.[1] ?? file,
      share: text.match(/share of the talking: (\d+)%/)?.[1] ?? "",
      stops,
      oneThing: text.match(/\*\*One thing next time:\*\* (.+)/)?.[1] ?? "",
      earned: text.match(/\*\*Earned the proposal:\*\* (.+)/)?.[1] ?? "",
      lens: text.includes("## Voss lens") ? {
        mirrors: Number(text.match(/^- Mirrors: (\d+)/m)?.[1] ?? 0),
        labels: Number(text.match(/^- Labels: (\d+)/m)?.[1] ?? 0),
        impact: Number(text.match(/^- Impact questions: (\d+)/m)?.[1] ?? 0),
        longest: Number(text.match(/^- Longest turn: (\d+)/m)?.[1] ?? 0),
        assumptions: Number(text.match(/^- Assumptions: (\d+)/m)?.[1] ?? 0),
        pauses: Number(text.match(/^- Pauses held: (\d+)/m)?.[1] ?? 0),
      } : null,
      missed: neverFound.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2)),
    };
  });
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

// Made clients: extra practice clients written by Claude on demand, kept in practice/scenarios.json.
// Invented, shaped by the market and places in profile.json.
const MADE = join(HERE, "scenarios.json");
const made: Persona[] = existsSync(MADE) ? (JSON.parse(readFileSync(MADE, "utf8")) as Persona[]) : [];
const allClients = (): Persona[] => [...personas, ...made];
const find = (id: unknown): Persona | undefined => allClients().find((p) => p.id === id);

const VOICES = { male: ["aura-2-draco-en", "aura-2-hyperion-en", "aura-2-arcas-en"], female: ["aura-2-pandora-en"] };
const PLACES = profile.places;
const TRADES = profile.trades.length ? profile.trades : [
  "restaurant group", "wine farm with a tasting room", "boutique hotel", "architecture studio", "small property developer",
  "interior design studio", "event and wedding venue", "physiotherapy practice", "dental practice", "boutique law firm",
  "bookkeeping firm", "estate agency", "bakery with three shops", "coffee roastery", "landscaping company",
  "kitchen and joinery workshop", "private school", "yoga and fitness studios", "vet practice", "safari and tour operator",
  "car dealership", "furniture showroom", "recruitment agency", "photography studio", "cleaning company for offices",
  "catering company", "solar installer", "language school", "marketing agency", "property management company",
];
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

const makerSystem = (ref: string): string => [
  `You invent practice clients for ${who()} to rehearse discovery calls on. Everything is invented: no real people, businesses or brands.`,
  `The consultant's market: ${profile.market}`,
  ref
    ? `Every client was introduced by ${referredBy(ref)}. They arrive curious, with no clear ask.`
    : "The client found the consultant on their own. They arrive curious, with no clear ask.",
  "Make it EASY: friendly, open, talks freely once asked a real question, answers what is asked and stops. Not technical.",
  "The business must have a real, concrete operations problem that only good questions bring out, with a flow from first contact to getting paid, where it fails, numbers, the people involved, what has stopped them, and what would make them say yes. Value may be time, stress, growth or money; money in the local currency.",
  "Reply with JSON only, no code fence, exactly this shape:",
  `{"name":"first and last name fitting the place","business":"business name and a few words on what it is","place":"City, Country","voice":"male|female","currency":"the local currency, as people say it","brief":"two short sentences: what the business is, and ${ref ? `that ${ref} introduced them` : "how they found the consultant"} with no ask yet","greeting":"one friendly spoken opening line${ref ? ` that mentions ${ref}` : ""}","manner":"one sentence on how they come across","hidden":["Why now: ...","What is really wanted: ...","The flow: ...","Where it fails: ...","Size: ...","Who touches it: ...","What is stopping it: ...","What would make them say yes: ..."]}`,
  "Plain English. No em dashes.",
].join("\n");

let saving = Promise.resolve();
async function makeClient(ref: string): Promise<Persona> {
  const trade = pick(TRADES), place = pick(PLACES);
  const taken = allClients().map((p) => `${p.name} (${p.business})`).join("; ");
  const raw = await ask(makerSystem(ref), `Make one client: a ${trade} in or near ${place}. Do not reuse any of these names or businesses: ${taken}`, "sonnet");
  const p = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")) as Omit<Persona, "id" | "level" | "speaker" | "referrer">;
  if (!p.name || !Array.isArray(p.hidden) || p.hidden.length < 5) throw new Error("The new client came back incomplete. Try again.");
  const voice = p.voice === "female" ? "female" : "male";
  const persona: Persona = { ...p, voice, referrer: ref, id: `easy-${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`, level: "Easy", speaker: pick(VOICES[voice]) };
  saving = saving.then(() => { made.push(persona); writeFileSync(MADE, JSON.stringify(made, null, 2)); });
  await saving;
  return persona;
}

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  idleTimeout: 120,
  async fetch(req) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/") return new Response(Bun.file(join(HERE, "index.html")));

      if (url.pathname === "/api/personas") {
        // `made` marks the extra Easy clients; `called` says whether a run file exists for them yet.
        const runs = existsSync(RUNS) ? readdirSync(RUNS) : [];
        return json(allClients().map(({ id, name, business, place, level, voice, brief, greeting }) => ({
          id, name, business, place, level, voice, brief, greeting,
          made: !personas.some((p) => p.id === id),
          called: runs.some((f) => f.endsWith(`-${id}.md`)),
        })));
      }

      if (url.pathname === "/api/make" && req.method === "POST") {
        const body = (await req.json().catch(() => ({}))) as { referrer?: string };
        const p = await makeClient(typeof body.referrer === "string" ? body.referrer.trim().slice(0, 60) : profile.referrer);
        return json({ id: p.id, name: p.name, business: p.business, place: p.place, level: p.level, voice: p.voice, brief: p.brief, greeting: p.greeting, made: true, called: false });
      }

      if (url.pathname === "/api/log") return json(readLog());

      // What the page needs to fit the consultant: name, referrer, and the Welcome intro line.
      if (url.pathname === "/api/profile") return json({ name: profile.name, referrer: profile.referrer, intro: introLine() });

      if (url.pathname === "/api/coach" && req.method === "POST") {
        const body = (await req.json()) as { personaId: string; history: Line[]; focus: string; chat: CoachLine[] };
        const p = find(body.personaId);
        if (!p) return json({ error: "Unknown client." }, 400);
        const prompt = [
          `The client on this call was ${p.name}, ${p.business}. What was true but hidden about them:`,
          ...p.hidden.map((h) => `- ${h}`),
          "",
          "The call:",
          script(body.history, p),
          "",
          `What this coaching session is about: ${body.focus}`,
          "",
          body.chat.length ? "The coaching so far:\n" + body.chat.map((l) => `${l.who === "coach" ? "COACH" : ME.toUpperCase()}: ${l.text}`).join("\n") : "Start the session now.",
          "",
          "Reply with the coach's next spoken turn only.",
        ].join("\n");
        return json({ text: await ask(coachSystem(refOf(p)), prompt, "sonnet") });
      }

      // Each coaching chat is kept under the run it belongs to, so the lesson is not lost.
      if (url.pathname === "/api/coach-save" && req.method === "POST") {
        const body = (await req.json()) as { file: string; focus: string; chat: CoachLine[] };
        const file = join(RUNS, body.file.split("/").pop() ?? "");
        if (!file.startsWith(RUNS) || !existsSync(file) || !body.chat.length) return json({ ok: false });
        const block = ["", `## Coaching: ${body.focus.split("\n")[0].slice(0, 80)}`, "", ...body.chat.map((l) => `**${l.who === "coach" ? "Coach" : ME}:** ${l.text}\n`)].join("\n");
        const text = readFileSync(file, "utf8");
        const cut = text.indexOf("\n## Transcript");
        writeFileSync(file, cut < 0 ? text + block : text.slice(0, cut) + block + text.slice(cut));
        return json({ ok: true });
      }

      if (url.pathname === "/api/speak") {
        const id = url.searchParams.get("personaId");
        // The coach has its own voice, so it never sounds like the client.
        const p = id === "coach" ? ({ speaker: "aura-2-pandora-en" } as Persona) : find(id);
        const text = (url.searchParams.get("text") ?? "").trim();
        if (!p || !text) return json({ error: "Nothing to say." }, 400);
        return await speech(p, text);
      }

      if (url.pathname === "/api/turn" && req.method === "POST") {
        const body = (await req.json()) as { personaId: string; history: Line[] };
        const p = find(body.personaId);
        if (!p) return json({ error: "Unknown client." }, 400);
        const prompt = `The call so far:\n${script(body.history, p)}\n\nReply with ${p.name}'s next spoken line only.`;
        return json({ text: await ask(clientSystem(p), prompt, "haiku") });
      }

      if (url.pathname === "/api/debrief" && req.method === "POST") {
        const body = (await req.json()) as { personaId: string; history: Line[]; seconds: number };
        const p = find(body.personaId);
        if (!p) return json({ error: "Unknown client." }, 400);
        const prompt = `Client: ${p.name}, ${p.business}. Their ask: ${p.brief}\n\nHidden facts:\n${p.hidden.map((h) => `- ${h}`).join("\n")}\n\nTranscript:\n${script(body.history, p)}`;
        // Now and then the marker answers with text that is not clean JSON; ask once more before giving up.
        const markOnce = async (): Promise<Debrief> => {
          const raw = await ask(debriefSystem(refOf(p)), prompt, "sonnet");
          const body = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
          const parsed = JSON.parse(body) as Debrief;
          if (!Array.isArray(parsed.stops)) throw new Error("Debrief came back without stops.");
          return parsed;
        };
        let debrief: Debrief;
        try { debrief = await markOnce(); } catch { debrief = await markOnce(); }
        const judged = (debrief.lens ?? {}) as Partial<Lens>;
        debrief.lens = {
          mirrors: Number(judged.mirrors) || 0, labels: Number(judged.labels) || 0, impact: Number(judged.impact) || 0,
          missedMirror: judged.missedMirror ?? { client: "", tryThis: "" },
          ...plainCounts(body.history),
        };
        const mine = words(body.history, "you");
        const theirs = words(body.history, "client");
        const share = mine + theirs ? Math.round((mine / (mine + theirs)) * 100) : 0;
        const file = saveRun(p, body.history, body.seconds, share, debrief);
        return json({ debrief, share, file });
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Something went wrong." }, 500);
    }
  },
});

console.log(`Practice client ready: http://localhost:${PORT}`);
