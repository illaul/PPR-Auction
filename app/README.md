# Deflator — live auction assistant

The screens in `Deflator.dc.html`, built for real: a single page that prices every
player against your league, watches the money leave the room, and tells you the
most you should pay for whoever is on the block.

```bash
cd app
npm install
npm run dev          # http://localhost:5173
npm run build        # static bundle in app/dist
npm run check        # engine vs. the workbook it was ported from
node --experimental-strip-types src/state/names.check.ts        # ESPN name matching
node --experimental-strip-types src/state/projections.check.ts  # refresh merge + gate
```

Open it and pick a starting point: **Open the board** drops you into a mid-auction
demo driven by the real player pool, **Start empty** waits for the extension or
for you to type picks in yourself.

## What is on screen

| region | what it answers |
| --- | --- |
| top strip | connection, inflation, budget, true max bid, slots, board depth |
| the block | the one number that matters, current bid, walk-away, and what the sale does to inflation |
| bid-o-meter | where the live bid sits against your value and against the market |
| verdict | bid or pass, with the reason and the alternative you would buy instead |
| my roster | filled slots at what you paid, open slots at what the plan budgets |
| best remaining | the best player left at each position and the dollar dropoff to the next |
| model vs market | where this model and the site's prices disagree, both directions |
| who can outbid me | every team's true max bid and what they still need |
| drawer (⌃T) | the whole pool: search, filter, sort by surplus, nominate, record a sale |
| refresh (top) | pull new projections and re-rank everything off them |

Four states share the same board: disconnected, waiting for a nomination, your
turn to nominate, and just won — all driven by the live data, not by a mode switch.

## Refreshing the numbers

**Refresh data** at the top of both screens pulls fresh season projections and
re-derives the whole board from them — baselines, VBD, tiers, dollars, every
price. A draft already in progress survives it: sales are keyed by player, so a
mid-draft refresh re-ranks without losing a single pick. Market values survive
too; they are not part of a projection pull.

Two sources:

- **ESPN, through the extension.** The app asks, the extension fetches ESPN's
  public PPR default projections and hands back stat lines. Scoring is applied
  here, against your league's settings — never ESPN's.
- **A file.** `load a file` takes the JSON this repo exports
  (`tools/export_players.py`) or a FantasyPros-style CSV with a header row.
  This path works with no extension at all.

Whatever arrives is merged by name (suffixes, punctuation and defenses handled;
an unmatched name is added as a new player rather than silently dropped) and
then **gated**: a pull with too few players, zeroed stats, or impossible totals
is refused with a reason, and the old numbers stay. A refresh that quietly loads
garbage would still price the board with total confidence — so it does not get
to.

The applied set is kept in `localStorage`, so it survives a reload. `reset`
returns to the projections that shipped with the app.

## How it is wired

```
data/players.json ─┐
data/league.json ──┼─► engine/valuation.ts ──► state/model.ts ──► ui/*
                   │        prices, baselines,     view: teams, slots,
                   │        inflation, max bid     verdict, dropoffs
sync/* ────────────┘
  extension.ts  ESPN draft room, relayed by the Chrome extension (<1s)
  demo.ts       a scripted auction off the real pool, for practice
  manual        type the price in the drawer when nothing is relaying
  refresh.ts    fresh projections, from the extension or a file
```

Every price on screen is `model price × inflation`, and inflation is
`(money left in the league) ÷ (value left on the board)`. **An overpay drains
money faster than it removes value, so the rest of the board gets cheaper.** A
bargain does the reverse.

## Design system

`src/styles/organic.css` is the Organic design system exported from Claude
Design, vendored unchanged — it owns the palette, the type pairing (Caprasimo /
Figtree) and the component primitives. `src/styles/app.css` adds only what the
board needs on top of those tokens.

## Known gaps

- The extension's ESPN draft-room selectors and the projection stat-id map are
  both unverified against live ESPN — see `extension/README.md`. The file
  refresh path needs neither.
- The league URL on the setup screen is stored for the extension to use; league
  settings themselves still come from the exported workbook.
