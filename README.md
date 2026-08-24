# PPR-Auction

Two things live here:

- **`ANALYSIS.md`** — a teardown of the Deflators League workbook and the
  valuation algorithm inside it.
- **`app/`** — **Deflator**, that algorithm rebuilt as a live auction assistant
  that syncs with your ESPN draft. (`extension/` is an optional add-on; you do
  not need it.)

---

# Deflator — install and use

## 1. What you need

| | |
| --- | --- |
| Node | **22.12 or newer** (`node -v`). |
| Terminal | PowerShell, Terminal.app, anything — the commands below are identical on Windows and macOS. |
| A browser | any. No extension required. |
| Time | about five minutes, once. |

## 2. Install

```bash
git clone -b claude/file-algo-analysis-tfvrpf https://github.com/illaul/PPR-Auction
cd PPR-Auction
npm install
npm run dev
```

Run those from the **repo root** — `npm install` there installs the app's
dependencies for you. (Everything also works from inside `app/` if you prefer;
that is where the app's own `package.json` lives.)

Open **http://localhost:5173** — or whatever address the terminal prints, if
that port is busy. You land on the settings screen with your league
already filled in — 12 teams, $200, full PPR, 16 slots.

Sanity-check the maths if you like — all three pass in a few seconds:

```bash
npm run check
```

That runs three suites: prices against the workbook, ESPN name matching, and
the refresh merge with its safety gate.

## 3. Point it at your league

Paste your league URL into **ESPN league URL** and hit **Save**. Anything with
`leagueId=…` in it works; so does the bare number.

### Private league? Add your two cookies

ESPN only talks about a private league to a logged-in session, which means two
cookies.

1. Open **fantasy.espn.com** in a tab where you are logged in.
2. DevTools (`F12` / `⌥⌘I`) → **Application** (Chrome) or **Storage** (Firefox)
   → **Cookies** → `https://fantasy.espn.com`.
3. Copy the values of **`espn_s2`** (long, full of `%` escapes) and **`SWID`**.
4. Create **`app/.env.local`** — note the `app/`, not the repo root:

```bash
ESPN_S2=AEBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SWID={xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}
```

Quotes are fine, and the braces around `SWID` are added for you if you leave
them off. Save the file and watch the `npm run dev` terminal — it restarts
itself and prints **`ESPN cookies loaded`**. If it says *no ESPN cookies*, the
file is in the wrong place or the names are misspelled.

### Check it before draft day

```bash
npm run espn 1184402        # your league id
```

It reads `app/.env.local` itself and tells you exactly where you stand — cookies
found or not, whether ESPN accepted them, how many teams and picks it can see.

Then pick **Your team** from the dropdown. Budget, max bid and roster slots are
all read off that one.

> **Why a dev server at all?** ESPN sends no CORS headers, so a browser can
> never call it directly. `npm run dev` proxies `/espn/*` through to ESPN
> server-side, attaching those cookies there. They are never exposed to the
> page, and `.env.local` is gitignored.

## 4. Before the draft

**Pick your shape.** The starter/bench slider is the one real dial. At **88%**
(default) the curve is steep — big money at the top, dollar bench guys. Drag
toward **65%** for a flatter roster. Prices re-derive as you drag, and you can
change it mid-draft.

**Refresh the numbers.** Projections go stale fast in August. **Refresh data**
at the top pulls ESPN's season projections through the same proxy and rebuilds
every ranking from them. `load a file` takes a FantasyPros CSV export or the
JSON this repo produces, if you would rather bring your own.

Whatever arrives is checked before it is applied — too few players, zeroed
stats, or impossible totals are refused with a reason and your old numbers
stay. A board priced off garbage would still look completely authoritative.

**Take a practice run.** *Open the board* drops you into a simulated mid-auction
off the real player pool: bids tick, inflation moves, the verdict flips.

## 5. Draft night

Hit **Start empty — I'll enter picks**, then **ESPN live** in the top bar. It
polls your league every three seconds.

**What syncs by itself:** every completed sale, within one poll. Inflation, your
budget, max bids, best-remaining and every price update off them.

**What does not:** the bid climbing right now. ESPN's draft view lists finished
picks only — the live auction bid is not in it. So:

1. Type whoever is up into **Who's up?** and click them. The big number is your
   max bid on them, at current inflation.
2. Track the room with the **− / +** buttons under *Current bid*. The verdict
   bar flips from *Bid to $X* to *Let it go* the moment it crosses your number.
3. When they sell, the poll picks it up on its own. Nothing to type.

**Read the board in this order:** the giant number → the verdict bar → *walk
away at*. Then the panels: **my roster** (what you paid, what is budgeted for
each open slot), **best remaining** (the dollar dropoff to the next player at
each position — big dropoff means act now), **who can outbid me** (a team that
cannot cover the bid cannot take the player from you).

`⌃T` opens the full pool: search, filter, sort by surplus, and record a sale by
hand if you ever need to.

## 6. Reading the numbers

**Inflation runs backwards from most people's instinct.** An overpay drains
money faster than it removes value, so **everything left gets cheaper**. A
bargain leaves more money chasing the same value and pushes the board **up**.
That is what the league name is about — when the room overspends early, sit
still and let the discounts come to you.

**Two different max bids.** The top strip's *true max bid* is your budget minus
a dollar for every empty slot — a hard ceiling. The giant number is what *this
player* is worth to you. Bid the smaller one.

**Market is normalised.** Site values are published for 10-team, $2,000
leagues; yours is 12-team, $2,400. Every market figure on screen is scaled into
your currency first, so "market $65" means $65 *in your league*.

**Tiers are soft, dropoffs are hard.** Tier labels come from z-scores across the
whole list and shift when the list changes. The dropoff number is the honest
version of the same idea.

## 7. A dry run without ESPN

There is a stand-in server that speaks ESPN's two views and drips out a pick
every few seconds, so the whole loop can be rehearsed offline:

```bash
node tools/fake-espn.mjs                      # terminal 1
ESPN_ORIGIN=http://localhost:4599 npm run dev # terminal 2
```

Save league id `123`, hit **ESPN live**, and watch the board fill up.

## 8. When something breaks

| symptom | what to do |
| --- | --- |
| *Couldn't reach ESPN* | The proxy lives in the dev server — make sure `npm run dev` is still running. |
| *ESPN rejected the request* | Run `npm run espn <leagueId>`. It says whether the cookies are being read, and whether ESPN accepted them. |
| Terminal says *no ESPN cookies* | `.env.local` must sit in `app/`, not the repo root, and the keys are `ESPN_S2` and `SWID`. |
| Cookies worked yesterday, not today | `espn_s2` rotates. Copy both values again from a logged-in tab. |
| *That league has no draft on it* | Wrong league id, or the draft has not been created yet. |
| ESPN live button is disabled | No league id saved. Settings → paste the URL → Save. |
| Sales stop arriving | Three failed polls in a row raise a banner with the reason. Keep going by recording sales in the drawer. |
| Prices look wrong after a refresh | `reset` next to the refresh button returns to the projections that shipped. |
| A player never appears | Names that cannot be matched are dropped rather than guessed at. Put them on the block by hand. |

## 9. Optional: the Chrome extension

Only worth installing if you want the **live bid** relayed too, sub-second,
instead of tracking it with − / +. `chrome://extensions` → Developer mode →
Load unpacked → the `extension/` folder, then pick **Extension** in the top bar.
Its draft-room selectors are unverified against a live room — see
`extension/README.md`.

## 10. What is not proven yet

The ESPN request shapes are written from ESPN's public views and exercised
end-to-end against a stand-in server, but **not against live ESPN** — that
needs a real session. On your first mock draft, check that sales arrive and that
**Refresh data** returns a sane player count. If the refresh looks wrong, the
stat-id map in `app/src/sync/espn.ts` is the thing to verify; `sampleStats()`
returns the raw object from the last pull.

Everything else — the pricing engine, inflation, max bids, name matching, the
refresh merge and its gate — is covered by checks that run in seconds.
