# ⚽ FPL Snake Draft

A local web app for running a **custom-order snake draft** for a Fantasy
Premier League draft league — the thing the official site won't let you do
(it only randomizes). Enter your managers, set the order you want, and draft
live from the **up-to-date FPL player list**.

Built for a 10-manager league using full FPL Draft squad rules, but it works
for any number of managers.

## Features

- **Live player data** pulled straight from the official FPL API (points,
  form, price, ownership, injury/availability flags).
- **Custom draft order** — type your managers in any order, reorder with the
  arrows, or hit 🎲 **Randomize**.
- **Snake ordering** — round 1 goes 1→10, round 2 snakes 10→1, and so on for
  15 rounds.
- **FPL Draft squad rules enforced** — 15 players per squad (2 GK, 5 DEF,
  5 MID, 3 FWD). A player can only be drafted by one manager, and you can't
  exceed a position's cap.
- **Search, filter and sort** the player pool by position, points, form,
  price or ownership.
- **Live squad panels** for every manager, with position slots filling up.
- **Pick clock** — an optional per-pick countdown (30s / 60s / 90s / 2 min)
  that resets each turn, warns as it runs low, and beeps when time's up. Pause,
  resume or reset it any time.
- **Best-available suggestions** — the top eligible players the manager on the
  clock can legally draft, one click to pick. Ranked by total points, or by
  price in pre-season when points haven't accrued yet.
- **Export to CSV** — download every squad (one row per pick, in draft order)
  to open in a spreadsheet.
- **Undo** the last pick, and the whole draft **auto-saves** to your browser —
  refresh or close the tab without losing progress.

## Requirements

- [Node.js](https://nodejs.org/) 18+ (works on 20/22).
- A normal internet connection on draft night (the app fetches live FPL data).

## Running it

```bash
npm install
npm run dev
```

Then open the URL it prints (usually <http://localhost:5173>).

> **Why a dev server and not just an HTML file?** The official FPL API doesn't
> send CORS headers, so a browser page can't fetch it directly. The dev server
> proxies the request for you (see `vite.config.ts`). Run it on one machine on
> draft night, share your screen, and call out the picks.

## Testing with sample data (e.g. between seasons)

The real FPL API goes offline between seasons and during daily maintenance
(you'll see a "Game Updating" message, and the app shows a friendly notice).
To try the app out any time, click **"Use sample data instead"** on the load
screen.

Sample mode loads **400 fictional players** spread across the 20 real Premier
League clubs, with realistic positions, prices and last-season-style points —
enough to run a full 10-manager draft and try every feature. A **🧪 Demo mode**
banner stays visible so it's never mistaken for live data, and you can switch
back to live data any time.

The dataset is generated (and reproducible) via `npm run gen-sample`.

## How a draft goes

1. On the setup screen, enter your 10 managers **in the draft order you want**
   (or randomize). Names must be unique.
2. Hit **Start draft**.
3. The manager **on the clock** is highlighted. Find their player, hit
   **Draft**, and it advances automatically in snake order.
4. Keep going until all 150 picks are made. Use **Undo** for mistakes and
   **Reset** to start over.

## Tech

- React + TypeScript + Vite
- No backend, no database — all draft state lives in your browser's
  `localStorage`.

## Notes / possible next steps

- This is a **single-machine** tool: one person runs it and drives the draft.
  Making it multiplayer (all 10 drafting from their own devices in real time)
  would need a shared server + websockets — happy to add that if you want it.
- Possible additions: auto-pick when the clock expires, a full pick-by-pick
  draft log, or keeper/pre-assigned picks if your league carries players over.
