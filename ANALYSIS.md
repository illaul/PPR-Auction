# 2026 Fantasy Football — Deflators League workbook: how the valuation algorithm works

Source file: `2026_FantasyFootball_DeflatorsLeague.xlsm` (827 KB, 25 sheets, 6 VBA modules).
Lineage: the FantasyPros/VBD auction workbook published by reddit's `/u/elboberto` (Bob Mello),
with the bilinear pricing model credited to `/u/theyreallthrowaways` and the cheat sheet layout
to `/u/Beer4TheBeerGod`. Projections came from `fantasypros.com/nfl/projections` via web queries
into the hidden `*_Raw` tabs. Every number below was extracted from the file's cached values and
re-derived independently by `tools/inspect_workbook.py`.

---

## 1. League configuration read out of the file

| Setting | Value |
| --- | --- |
| Teams / budget | 12 × $200 = **$2,400** |
| Lineup | 1 QB, 2 RB, 2 WR, 1 TE, 1 FLEX (WR/RB/TE), 1 K, 1 DST |
| Roster | 16 (9 starters + 7 bench) → 192 total roster spots |
| Scoring | full PPR (1.0), 0.1/rush+rec yd, 6 pt rush/rec TD, 6 pt pass TD, 0.04/pass yd (25 yd/pt), −3 INT, −2 fumble lost |
| Valuation method | `Starter/Bench` (the bilinear model), 88 % starter / 12 % bench |
| Market comparison | Yahoo default values |
| Allow negative values | Yes |
| Subtract keepers from budget | No |

$24 is carved off the top — $1 per team for a kicker and $1 for a defense — leaving
**$2,376 for the 168 skill-position roster spots**.

## 2. The pipeline

```
*_Raw tabs (FantasyPros projections)
   └─► QB/RB/WR/TE sheets ──► FPTS (col P, league scoring applied)
          ├─► Flex* sheets ──► how many flex spots each position wins
          ├─► LeagueInfo   ──► baselines, budget split, price factors
          ├─► StartVBD (R), BenchVBD (S), $ (T), Inflated $ (U), Tier (AA)
          └─► Auction sheet ──► live inflation, market skew, draft tracking
                 ├─► Teams sheet   ──► per-team budgets and max bids
                 └─► CheatSheet    ──► printable snake-draft board
```

### Step 1 — Fantasy points

`P = ATT·0 + CMP·0 + PassYds·0.04 + PassTD·6 + INT·(−3) + RushYds·0.1 + RushTD·6 + Rec·1 + RecYds·0.1 + RecTD·6 + FUM·(−2)`

Plain dot product of the raw projection row with the scoring table on `LeagueInfo`. Nothing is
regressed, age-adjusted, or risk-weighted — the model inherits FantasyPros' consensus exactly.

### Step 2 — Two baselines per position, not one

This is the part that makes the sheet different from a textbook VBD calculator. Each position gets:

* a **starter baseline** — the last player who will be *started* leaguewide, and
* a **bench baseline** — the last player who will be *rostered* at all.

Starter counts come out of the hidden Flex tabs: base starters (2 RB × 12 = 24, etc.) plus
whichever players win the 12 flex spots on projected points. For 2026 the flex allocates
**3 to RB and 9 to WR, none to TE**. Bench spots (84 of them) are split in proportion to starter
counts, with a hard cap that keeps total rostered QBs ≤ 32 (there are only so many starting NFL QBs).

| | QB | RB | WR | TE |
| --- | --- | --- | --- | --- |
| Starters (incl. flex) | 12 | 27 | 33 | 12 |
| Rostered (bench baseline) | 24 | 54 | 66 | 24 |
| Point gap between the two baselines | 53.5 | 95.0 | 61.8 | 39.6 |

### Step 3 — Two VBD numbers per player

```
StartVBD  R = MAX(FPTS − FPTS[starter baseline], 0)
BenchVBD  S =     FPTS − FPTS[bench   baseline]        (may go negative)
```

### Step 4 — Bilinear price

```
$ = R · StarterPF + (S − R) · BenchPF
```

Above the starter baseline `S − R` is a constant (the point gap in the table above), so the price
curve is **piecewise linear in projected points with a single kink at the starter baseline**:

* below it, each fantasy point is worth `BenchPF` = **$0.1046**
* above it, each fantasy point is worth `StarterPF` = **$0.3786** — a **3.62× kink**
* the curve is continuous: at the baseline both branches equal `gap × BenchPF`

Economically: replacement-level depth is cheap and roughly commoditised, and you pay a steep,
linear premium for points that actually clear a starting lineup slot.

### Step 5 — Calibrating the two price factors

```
BenchPF   = (Budget × BenchPct)  / Σ BenchVBD over bench-labelled players
StarterPF = (Budget × StarterPct − Σ_pos gap_pos × starters_pos × BenchPF) / Σ StartVBD
```

The subtraction in the numerator removes the flat bench component that every starter also
collects, so the two pools do not double-count. The consequence is an exact identity, which the
verification script confirms to the cent:

```
Σ prices over the 168 rostered skill players = $2,376.00 = the skill-player budget
+ 24 K/DST at $1                             = $2,400.00 = the league's entire budget
```

Nothing is fudged or normalised at the end — the calibration makes it balance by construction.

### Step 6 — The alternative method

`LeagueInfo!H7 = "Average VBD"` switches every price to `AvgVBD × TotalPF`, where
`AvgVBD = (R + S)/2` and `TotalPF = $2,376 / Σ AvgVBD = $0.2910/pt`. That is a straight linear
model with no kink; it flattens the curve (Jahmyr Gibbs $78.81 → $66.76) and is the right setting
for a league that drafts evenly rather than stars-and-scrubs.

### Step 7 — Live inflation

`Auction!A2`:

```
inflation = (Σ projected $ of every valued player − Σ $ actually paid so far)
            ÷ (Σ projected $ of the players still undrafted)
```

Because Σ projected $ *is* the league budget (step 5), the numerator is literally the money still
on the table. Every `Inflated $` cell is `projected $ × inflation`. Note the direction: an **overpay
drains money faster than it removes value, so everyone left gets cheaper** (deflation), and a
bargain leaves more money chasing the same value, pushing the rest of the board up. The same sheet derives, per position, the
best and second-best player still available, the dropoff between them, average value remaining,
and the share of each position's dollars already spent. `Teams!J` gives each manager's true
max bid: `remaining budget − (empty roster spots − 1)`.

## 3. What the model says about this league

| | RB | WR | TE | QB | K + DST |
| --- | --- | --- | --- | --- | --- |
| Share of the $2,400 | **43.7 %** | **39.1 %** | 8.6 % | 7.5 % | 1.0 % |

Top of the board: Gibbs $78.81, Bijan $77.76, CMC $64.45, Nacua $62.40, Chase $60.84,
JSN $56.60, J. Taylor $55.27 — then McBride $37.17 as the top TE and Josh Allen $32.48 as the
top QB. With 6-point passing TDs but a single QB slot, the model still prices QBs at 7.5 % of the
pot; the 12th-best QB is only 53 points behind the 24th, so waiting is nearly free.

## 4. Findings

### High

1. **The projection feed is gone.** The workbook was last saved by LibreOffice 24.2.7.2, which
   dropped `xl/connections.xml` and every `queryTable` part; the table names still read
   `_2026_QB_Projections___Consensus_..._FantasyP`, but the `*_Raw` tabs are now static values and
   the `ExternalData_1`/`ExternalData_2` defined names are orphans. `Refresh_All_Data` loops over
   `ThisWorkbook.Connections` — now an empty collection — so it will run the fill macros and
   report "Refresh complete" **without fetching a single new projection**. Re-import the
   FantasyPros tables by hand (or in Excel on Windows) before trusting the numbers on draft day.
2. **The position tabs are stale-sorted.** Rank (col A) is recomputed live, but row order is only
   fixed when a macro sorts it — 113 of 189 WR rows are displaced, worst case by 18 positions.
   Prices are unaffected (they use `LARGE`/`RANK`, not row order), but reading the tabs top-down
   is misleading, and `Refresh_CheatSheet` copies **by row** (`QB!B3:B32`), so the printable cheat
   sheet is only correct because the macro sorts first.
3. **`Refresh_CheatSheet` will scramble your player tags.** It sorts `A2:V` on each position sheet,
   but the manual `Target?` column is `W` — outside the sort range. Tags stay behind while players
   move. Currently latent (no tags are entered yet); it bites the first time you tag players and
   then re-run the button. Widen the sort range to `A:AC` before using it.

### Medium

4. **`Site Skew` compares two different currencies.** Yahoo's default values are published for
   10-team/$2,000 leagues; this is 12-team/$2,400. Over the same 188 players the projected pool is
   **+19.8 %** larger, so nearly everyone looks like a bargain. Scale Yahoo by ≈1.198 (or fill in
   the `Custom` column on `DefaultAuctionValues` with your league's real values, as the Intro tab
   advises). After normalising, the actual edges are:

   *Cheap:* Kyle Pitts +$10.9, D'Andre Swift +$9.2, Rashee Rice +$9.0, Cam Skattebo +$8.6,
   Harold Fannin +$8.4, Zay Flowers +$8.2, Garrett Wilson +$8.0, Breece Hall +$7.9.
   *Expensive:* CeeDee Lamb −$28.4, James Cook −$24.2, Justin Jefferson −$21.6, Ja'Marr Chase −$18.5,
   Saquon Barkley −$17.4, Omarion Hampton −$17.1, JSN −$16.1, Nico Collins −$15.8.

5. **Tiers are an artefact of the player list, not of real dropoffs.** `AA` cuts z-scores at fixed
   ±0.5σ intervals, but the mean and σ are taken over the *entire column* — every replacement-level
   name included. Adding 50 more waiver-wire WRs shifts every tier boundary. The result is one
   "QB1", four "WR1"s, and 115 players labelled "WR8". Treat tiers as a rough shade, not a cliff;
   the `Dropoff` cells on the Auction sheet are the honest version of the same idea.
6. **Name matching is exact-string across six sheets** (`Auction` ↔ position ↔ `DefaultAuctionValues`
   ↔ `BYEs` ↔ `DepthChart`) with no fuzzy fallback. 20 of 345 market-value rows don't match the
   current pool ("Los Angeles (LAR) Rams" vs "Los Angeles Rams", Brandon Aiyuk, Tyreek Hill,
   Ricky Pearsall …), and two valued players have no market price at all (AJ Dillon, LA Rams DST).
   Worse, `V` on the position sheets (`Drafted?`) wraps only the *CheatSheet* lookup in `IFERROR` —
   the `Auction` `MATCH` is bare, so a player added to a position tab without re-running
   `Fill_Auction` produces `#N/A` that propagates into the positional-scarcity figure.

### Low

7. **Hardcoded ranges everywhere** — `SUMIF(QB!Z3:Z74…)` against 79 QB rows, `WR!Z3:Z167` against
   189 WR rows, `Teams` summing `Auction!M13:M687` against a 588-row table. Harmless today only
   because the truncated tails all carry ≤ 0 VBD; it fails silently the moment the pool grows.
8. **The budget calibration reads row 3** of each position sheet to recover the baseline gap
   (`QB!S3−QB!R3`). That is correct only while row 3 holds a player above the starter baseline —
   true now, but combined with finding 2 it is an unguarded assumption.
9. **Negative prices are enabled** (`AllowNegative = Yes`), so deep players show values down to
   −$28.79 (QB). They are excluded from every sum, so the budget identity is safe, but the Auction
   board will display negative dollars for undraftable players.
10. **Dead artefact:** the defined name `InfVBD` points at `LeagueInfo!G6`, a text label, and is
    referenced nowhere.

## 5. Macro inventory (`vbaProject.bin`, 6 modules)

| Module | Procedures | Purpose |
| --- | --- | --- |
| Module1 | `Fill_Auction`, `Refresh_CheatSheet`, `Refresh_All_Data`, `DeleteNA_REF_Rows_*` | rebuild the Auction list from the position tabs; sort and repopulate the cheat sheet; the master refresh; clean `#N/A`/`#REF!` rows |
| Module2 | `Sort_Auction`, `Hide_Avoids`, `Show_Targets`, `Show_Sleepers`, `Hide_Keepers`, `Hide_Drafted`, `Clear_AuctionFilter`, … | AutoFilter buttons on the Auction sheet |
| Module3 | `Fill_Flex_WRRB`, `Fill_Flex_WRTE`, `Fill_Flex_WRRBTE`, `Fill_Flex_QBWRRBTE` | rebuild the four hidden flex tabs |
| Module4 | `ClearSheetCustomData` | wipe prices paid, drafted-by, and tags |
| Module5 | `FillQBStats` | paste `QB_Raw` into the QB sheet |
| Module6 | `Refresh_FixFlex` | delete `#N/A` rows left in the flex tabs |

All of it is `Select`/`Copy`-style recorded VBA with hardcoded row bounds; `Refresh_All_Data`
warns it is Windows-Excel-only and pads itself with `Application.Wait` calls totalling ~30 s.

## 6. Reproducing this

```bash
pip install openpyxl
python3 tools/inspect_workbook.py path/to/2026_FantasyFootball_DeflatorsLeague.xlsm
```

The script re-derives `StartVBD`, `BenchVBD`, and `$` for all 512 skill players from the raw
projections and baselines alone and compares against the workbook's cached values — currently
**zero mismatches** — then checks the budget identity, sort order, market skew, and tier sizes.
