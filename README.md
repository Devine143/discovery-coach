# Discovery call practice

Two small tools I built to get better at discovery calls:

- **Practice client** (`localhost:4517`): a pretend business owner you talk to out loud. When the call ends, you're marked on six stops (Welcome, Gate, Site, Office, Board, Show), your listening is counted (mirrors, labels, impact questions, pauses), and a coach replays the moments you missed.
- **Call coach** (`localhost:4518`): sits beside a real call. It listens to both sides, ticks off the ask, the pain, the number and the target as the client says them, and shows one next question plus a "mirror it" or "label it" nudge.

**This is tailored to me:** my background, my referrals, my market, my brand colours. With a little prompting and chatting to your agent of choice (Claude Code, Codex, any coding agent), you can make it yours. Start with `practice/profile.json`, then ask the agent for anything else.

## Set it up (about 10 minutes)

You need a Mac or PC with **Chrome**, **[bun](https://bun.sh)**, and **[Claude Code](https://claude.com/claude-code)**, logged in.

1. Clone this repo and open the folder in a terminal.
2. Get a free Deepgram key at [console.deepgram.com](https://console.deepgram.com). Make a file called `.env` in this folder with one line:
   ```
   DEEPGRAM_API_KEY=your-key-here
   ```
3. Run the check:
   ```
   bun practice/setup.ts
   ```
   The first time, it makes `practice/profile.json` and asks you to fill it in. The quick way is to tell your agent: *"Interview me and fill in practice/profile.json."*
4. Run the check again until it ends with **SETUP CHECK: PASS**.

## Use it

```
bun practice/server.ts
```
Open `http://localhost:4517` in Chrome and click **Make my first practice client**. It writes a client from your own market.

```
bun coach/server.ts
```
Open `http://localhost:4518` in Chrome for a real call. Fill in who it's with, then: mic on, share the call's sound (tick the audio box), start. **Wear headphones.**

To practise with the coach running, share the practice client's tab as the call's sound.

## Make it yours

Things worth asking your agent:

- "Change the questions in the Welcome crib to my own intro." (`practice/index.html`, the `STOPS` list)
- "Make the clients harder, or make them from [your niche]." (`practice/profile.json`, `trades`)
- "Swap the colours for my brand." (the `:root` colours at the top of both `index.html` files)
- "Mark me against my own discovery framework instead of the six stops." (the prompts in `practice/server.ts` and `coach/server.ts`)

## Privacy

Everything runs on your computer. Call transcripts are saved in `practice/runs/` and `coach/runs/` and never committed. The client's voice and the coach's fast ears use Deepgram; the thinking uses your own Claude Code login. Real client calls (ticked "Real client") save outside this folder. Tell the client the call is being transcribed.

## Costs

Deepgram's free credit covers a lot of practice. Claude usage comes out of your own Claude plan.
