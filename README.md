# PPR-Auction

Two things live here:

- **`ANALYSIS.md`** — a teardown of the Deflators League workbook and the
  valuation algorithm inside it.
- **`app/` + `extension/`** — **Deflator**, that algorithm rebuilt as a live
  auction assistant that syncs with your ESPN draft.

---

# Deflator — install and use

## 1. What you need

| | |
| --- | --- |
| Node | **22.12 or newer** (`node -v`). The test scripts want 22.6+ for TypeScript stripping. |
| Chrome | only for the live ESPN relay. The app itself runs in any browser. |
| Time | about ten minutes, once. |

## 2. Install

```bash
git clone -b claude/file-algo-analysis-tfvrpf https://github.com/illaul/PPR-Auction
cd PPR-Auction/app
npm install
npm run dev
```

Open **http://localhost:5173**. You should land on the settings screen with your
league already filled in — 12 teams, $200, full PPR, 16 slots.

Sanity-check the maths if you like — all three should pass:

```bash
node --experimental-strip-types src/engine/valuation.check.ts     # prices vs the workbook
node --experimental-strip-types src/state/names.check.ts          # ESPN name matching
node --experimental-strip-types src/state/projections.check.ts    # refresh merge + safety gate
```

## 3. Install the relay (optional, for live ESPN sync)

1. Chrome → `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → pick the `PPR-Auction/extension` folder
4. Reload the app tab. The settings screen should now read **Extension found**.

**The port matters.** The extension only injects on `localhost:5173` and
`localhost:4173`. Serving the app anywhere else means adding that origin to
`host_permissions` *and* `content_scripts` in `extension/manifest.json`.

The relay is read-only: it watches the draft room and reports what it sees. It
has no code path that can place a bid.

## 4. Before the draft

**Confirm the league.** Teams, budget, roster and scoring come from your
workbook export. The baselines line (`RB27 WR33 QB12 TE12`) is who the model
expects to be *started* leaguewide — that is what every price is measured
against.

**Pick your shape.** The starter/bench slider is the one real dial:

- **88% starters** (default) — stars and scrubs. Steep curve, big money at the
  top, dollar bench guys.
- **Lower it toward 65%** — flatter curve, more even roster.

Watch the split bars on the right move as you drag. Nothing is committed; you
can change it mid-draft and every price re-derives.

**Refresh the numbers.** Projections go stale fast in August.

- `Refresh data` → asks the extension to pull ESPN's season projections.
- `load a file` → takes a FantasyPros CSV export or the JSON this repo
  produces. **This path needs no extension and is the reliable one today.**

Anything that comes back is checked before it is applied. A pull with too few
players, zeroed stats, or impossible totals is refused with a reason and your
old numbers stay put.

**Take a practice run.** *Open the board* drops you into a simulated mid-auction
off the real player pool. Bids tick, inflation moves, the verdict flips. Learn
where your eyes go before it counts.

## 5. Draft night

Start with **Start empty — I'll enter picks**, then open your ESPN draft room in
another tab.

**Read the board in this order:**

1. **The giant number** — the most you should pay for whoever is up, capped by
   what your roster can still afford.
2. **The verdict bar** — *Bid to $X* or *Let it go*, with the reason and the
   player you'd buy instead with the same money.
3. **Walk away at** — one dollar past value. When the bid passes it, you are
   buying someone else's problem.

**The three panels:**

- **My roster** — filled slots at what you paid, open slots at what the plan
  budgets for them. The budget redistributes after every sale.
- **Best remaining** — the best player left at each position and the dollar
  **dropoff** to the next one. A big dropoff means act now; a small one means
  wait, someone equivalent is coming.
- **Who can outbid me** — every team's true max bid and what they still need.
  Teams that can't cover the bid can't take the player from you.

**The drawer (⌃T)** — the whole pool: search, filter, sort by surplus,
nominate, and **record a sale** when the relay isn't running. Typing sales in by
hand gives you exactly the same maths, just slower.

## 6. Reading the numbers

**Inflation runs backwards from most people's instinct.** An overpay drains
money faster than it removes value, so **everything left gets cheaper**. A
bargain leaves more money chasing the same value and pushes the board **up**.
That is what the league name is about. When the room overspends early, sit still
and let the discounts come to you.

**Two different max bids.** The top strip's *True max bid* is your budget minus
a dollar for every empty slot — the hard ceiling. The giant number is the most
that *this player* is worth to you. Bid the smaller one.

**Market is normalised.** Site values are published for 10-team, $2,000 leagues;
yours is 12-team, $2,400. Every market figure on screen is scaled into your
currency first, so "market $65" means $65 *in your league*.

**Tiers are soft, dropoffs are hard.** Tier labels come from z-scores over the
whole list and shift when the list changes. The dropoff number is the honest
version of the same idea — trust it more.

## 7. When something breaks

| symptom | what to do |
| --- | --- |
| *Extension not found* | Reload it at `chrome://extensions`, then reload the app tab. Check you're on port 5173. |
| Relay goes quiet mid-draft | Open the draft room console and run `window.__deflatorProbe()`. Anything showing `null` needs a new selector in `extension/content-espn.js`. Meanwhile, enter sales in the drawer. |
| Refresh refused with a reason | That's the safety gate. The numbers you had are still in place; try the file path. |
| Prices look wrong after a refresh | Hit `reset` next to the refresh button to return to the projections that shipped. |
| A player is missing entirely | The relay drops names it can't match rather than guessing. Nominate him from the drawer by hand. |

## 8. What is not proven yet

Two things could not be tested without a live ESPN session, and both are marked
in the code:

- **The draft-room selectors** (`extension/content-espn.js`) — class names ESPN
  can change. Budget one mock draft to confirm them with `__deflatorProbe()`.
- **The projection stat-id map** (`extension/projections.js`) — verify with
  `__deflatorRawStats()` in the service worker console after a pull.

Everything else — the pricing engine, inflation, max bids, name matching, the
refresh merge and its gate, the extension loading and being detected — is
covered by checks that run in seconds.
