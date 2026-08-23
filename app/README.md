# Deflator — app

The valuation engine is here and complete; the UI waits on the Claude Design
canvas (`Deflator.dc.html`).

```
app/
  data/      exported from the workbook by tools/export_players.py
  src/engine/valuation.ts        the model: baselines, bilinear pricing, inflation, max bid
  src/engine/valuation.check.ts  checks it against the workbook's own numbers
```

Run the checks:

```bash
python3 tools/export_players.py <workbook.xlsm> app/data   # refresh the data
node --experimental-strip-types app/src/engine/valuation.check.ts
```

Current result: prices match the workbook to $0.000000 across all 576 players,
and the priced pool sums to exactly $2,400.00.

## What the engine gives the UI

| call | returns |
| --- | --- |
| `priceBoard(players, league)` | every player priced, plus baselines and the two price factors |
| `inflation(board, sales)` | multiplier for every price given what has sold so far |
| `maxBid(remaining, filled, league)` | the most a team can bid and still fill its roster |
| `dropoff(board, pos, sold, inflate)` | best remaining at a position and the gap to the next |

`league.method` switches between the bilinear `Starter/Bench` model and flat
`Average VBD`. `league.starterPct` is the stars-and-scrubs dial.

## Direction of inflation

An overpay drains money faster than it removes value, so the rest of the board
gets **cheaper**. A bargain leaves more money chasing the same value and pushes
the board **up**. The UI should label the multiplier accordingly.

## Not yet built

- ESPN sync (Chrome extension content script + polling fallback) — see
  `docs/design-prompt.md` for the architecture.
- Everything visual.
