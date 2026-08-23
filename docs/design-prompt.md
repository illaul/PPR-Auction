# Claude Design brief — "Deflator" live auction assistant

Paste the block below into Claude Design to seed the canvas.

## Context this brief assumes

The app is the workbook's valuation model made live. Sync with an ESPN auction
draft happens two ways:

- **Chrome extension (primary).** Content script on `fantasy.espn.com` reads the
  live draft room and relays each nomination/sale in under a second. Works with
  private leagues, no cookie export, no CORS problem.
- **Polling fallback (no extension).** The unofficial
  `lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{year}/segments/0/leagues/{id}?view=mDraftDetail`
  endpoint at 3–5s intervals, through a thin proxy, with `espn_s2` / `SWID`
  cookies for private leagues. Unofficial — it can change without notice.

The SPA holds the model; the extension is only the wire. The design must show
both connection states.

---

```
Design "Deflator" — a single-page live assistant for an ESPN fantasy football AUCTION draft.

WHO IT'S FOR
One manager, mid-auction, in a 12-team $200 full-PPR league. They have ~8 seconds
between the auctioneer's call and their bid. The screen is glanced at, not read.
Everything that matters must be answerable without scrolling or clicking.

THE JOB, IN ONE SENTENCE
Tell me the most I should pay for the player currently on the block, and what it
costs me if I win or pass.

CORE MODEL (real, already built — use these terms and numbers, never placeholders)
- Every player carries a projected auction value from a bilinear VBD model: cheap
  "bench-grade" points at $0.105/pt, steep "starter-grade" points at $0.379/pt,
  with a kink at each position's starter baseline (RB27, WR33, QB12, TE12).
- Live inflation = (total pool value - dollars already spent) / (value still
  undrafted). Every price on screen is multiplied by it. It starts at 1.00.
- Real values to use in mockups: Jahmyr Gibbs $78.81, Bijan Robinson $77.76,
  Puka Nacua $62.40, Ja'Marr Chase $60.84, Christian McCaffrey $64.45,
  Trey McBride $37.17 (TE1), Josh Allen $32.48 (QB1). Budget splits RB 43.7%,
  WR 39.1%, TE 8.6%, QB 7.5%. Market traps: CeeDee Lamb model $37 vs market $65;
  bargains: Kyle Pitts $14.90 vs market $3.95.
- Tiers exist (RB1..RB8) but are noisy; show tier as a quiet chip, and show the
  honest version — dropoff to the next-best player at that position — prominently.

ARTBOARDS TO PRODUCE
1. DRAFT BOARD (the app, desktop 1440px) — the one screen the whole draft happens on:
   - Persistent top strip: live-sync status, inflation %, my budget remaining,
     my true max bid, roster slots filled (chips per slot), players gone / left.
   - Center-left, the largest element: THE PLAYER ON THE BLOCK. Name, position,
     team, bye. One enormous number: my max bid. Next to it, current bid and a
     bid-o-meter showing where the live bid sits against my value, the market
     value, and my walk-away point. A clear verdict line ("bid to $46 — $12 of
     surplus" / "let it go — $9 over").
   - Right rail: best remaining at each position with the dollar dropoff to the
     next one; positional scarcity as a small meter.
   - Left rail: my roster as lineup slots (filled = player + price paid, empty =
     ghost slot with the dollars budgeted for it), and dollars left per slot.
   - Bottom drawer: all 12 teams — budget left, max bid, roster needs, so I can
     see who can still outbid me.
   - A searchable/filterable player table is available but SECONDARY — it should
     feel like a drawer, not the main event.
2. PLAYER DETAIL (overlay on the board) — the price curve chart with this player
   marked on it, projected points, VBD, dropoff to next at position, bye-week
   conflicts with my roster, model value vs market value.
3. STATES (small artboards, same board, four moments):
   - Disconnected / extension not installed
   - Syncing live, nothing on the block yet ("waiting for nomination")
   - It's MY nomination — surfaces who to nominate and why
   - I just won a player — confirmation, budget redrawn, inflation ticked
4. SETUP / CONNECT (first run) — paste ESPN league URL, extension detection,
   league settings imported and shown for confirmation, valuation knobs
   (starter/bench budget split slider, stars-and-scrubs vs balanced).
5. CHROME EXTENSION POPUP (400x600) — connection status, league detected, picks
   relayed count, permissions, a single "open assistant" action.
6. POST-DRAFT RECAP — what I paid vs model value, surplus per player, positional
   allocation vs plan.
7. MOBILE (390px) — the block + max bid + my roster only. A glance device.

VISUAL DIRECTION
Think trading terminal, not sports app. Data-dense, calm chrome, tabular numerals
everywhere, generous contrast on the few numbers that decide a bid and quiet
treatment for everything else. Dark-first is appropriate (drafts happen at night,
often beside a bright ESPN draft room) but the light theme must be designed with
equal care, not inverted. Spend the accent in one place — money and edge. Keep
state color (live / warning / over-budget) semantically separate from the accent.
No emoji, no team-logo clutter, no rounded card soup, no gradient hero.

WHAT NOT TO DO
- Don't design a generic fantasy dashboard with equal-weight widgets. The max-bid
  number should be the loudest thing on the screen by a wide margin.
- Don't hide the walk-away price behind an interaction.
- Don't invent stats. Use only the fields listed above.
```

## Build plan once a direction comes back

- React SPA, valuation engine ported from the workbook (bilinear VBD, baselines,
  inflation, max bid) running client-side.
- MV3 Chrome extension: content script on the ESPN draft room, service worker
  relay to the app.
- Fixes for the workbook's known leaks carried into the engine: live projection
  import, tiering by real dropoffs rather than z-scores over the whole list,
  fuzzy player-name matching, and market values normalised to this league's pool
  size before any "bargain" is claimed.
