// Who is practising: one small file, so the practice client and the call coach fit any consultant.
// The setup script writes profile.json; profile.example.json shows the shape.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Profile = {
  // Your first name, as the client would say it.
  name: string;
  // Where you are, e.g. "Cape Town, South Africa".
  from: string;
  // One line on your background, e.g. "19 years running construction projects".
  background: string;
  // Who usually introduces clients to you. Blank if they come cold.
  referrer: string;
  // One line on why the referrer trusts you, e.g. "a friend whose travel business runs on a system I built".
  referrerStory: string;
  // Your market in a sentence: who your clients are and where.
  market: string;
  // Towns and cities your practice clients come from.
  places: string[];
  // Kinds of business to invent. Empty uses a general small-business list.
  trades: string[];
  // How the coach writes, e.g. "South African English" or "British English".
  english: string;
  // How money is written, e.g. "Rand as R85 000".
  money: string;
  // True for very short, plain lines (good for dyslexia, or anyone reading mid-call).
  plain: boolean;
};

const DEFAULTS: Profile = {
  name: "the consultant",
  from: "",
  background: "",
  referrer: "",
  referrerStory: "",
  market: "small business owners",
  places: ["London", "Manchester", "Dublin", "Amsterdam", "Cape Town", "Johannesburg", "Sydney", "Toronto"],
  trades: [],
  english: "plain English",
  money: "amounts in the client's local currency",
  plain: true,
};

const FILE = join(import.meta.dir, "profile.json");

export function loadProfile(): Profile {
  if (!existsSync(FILE)) return DEFAULTS;
  const raw = JSON.parse(readFileSync(FILE, "utf8")) as Partial<Profile>;
  return { ...DEFAULTS, ...raw, places: raw.places?.length ? raw.places : DEFAULTS.places, trades: raw.trades ?? [] };
}

export const profile = loadProfile();

// Plain words for the prompts.
export const who = (p: Profile = profile): string =>
  `${p.name}, an AI consultant${p.from ? ` in ${p.from}` : ""}${p.background ? ` (${p.background})` : ""}`;

export const referredBy = (ref: string, p: Profile = profile): string =>
  ref ? `${ref}${ref === p.referrer && p.referrerStory ? `, ${p.referrerStory}` : ""}` : "";

export const style = (p: Profile = profile): string =>
  `${p.english}. ${p.money}. No em dashes.${p.plain ? ` ${p.name} reads fast mid-call: very short, plain lines.` : ""}`;

// The intro line for the Welcome crib, in the consultant's own facts.
export const introLine = (p: Profile = profile): string =>
  [p.from ? `I'm in ${p.from.split(",")[0]}` : "", p.background, "and AI changed how I run my own work. Now I build it into other people's"]
    .filter(Boolean).join(", ") + (p.referrer ? `, like ${p.referrer}'s.` : ".");
