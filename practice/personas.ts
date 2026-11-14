// Hand-written practice clients. Empty on a fresh copy: the page makes clients from your market
// (practice/profile.json) and keeps them in practice/scenarios.json. Add your own here if you like.
// `brief` is what you see before the call. `hidden` is what only the right questions bring out.

export type Persona = {
  id: string;
  name: string;
  business: string;
  place: string;
  level: "Easy" | "Medium" | "Hard";
  voice: "male" | "female";
  // The Deepgram voice, e.g. "aura-2-draco-en".
  speaker: string;
  // How they talk about money, e.g. "pounds" or "rand".
  currency: string;
  brief: string;
  greeting: string;
  manner: string;
  hidden: string[];
  // Who introduced them. Missing means the referrer in profile.json.
  referrer?: string;
};

export const personas: Persona[] = [];
