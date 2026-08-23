#!/usr/bin/env python3
"""Extract and verify the valuation model inside the Deflators League auction workbook.

Usage:  python3 tools/inspect_workbook.py <path-to.xlsm>

Reads the cached values Excel stored in the file (no recalculation), rebuilds the
pricing identity from first principles, and reports where the workbook's own
numbers agree or disagree with it.

Requires: openpyxl
"""
import sys
from collections import Counter, defaultdict

import openpyxl

# Column layout of the four skill-position sheets (1-indexed, data starts row 3).
COL = {"rank": 1, "player": 2, "team": 6, "fpts": 16, "status": 17,
       "start_vbd": 18, "bench_vbd": 19, "price": 20, "avg_vbd": 26, "tier": 27}
SKILL = ("QB", "RB", "WR", "TE")


def load(path):
    return openpyxl.load_workbook(path, data_only=True)


def league(wb):
    li = wb["LeagueInfo"]
    return {
        "teams": li["F2"].value,
        "budget": li["F3"].value,
        "roster": li["F4"].value,
        "bench": li["F5"].value,
        "skill_dollars": li["H2"].value,      # budget less $1/team for K and DST
        "starter_pct": li["D15"].value,
        "starter_pf": li["D17"].value,        # $ per point of starter VBD
        "bench_pf": li["D18"].value,          # $ per point of bench VBD
        "starter_budget": li["D19"].value,
        "bench_budget": li["D20"].value,
        "method": li["H7"].value,
        "site": li["F7"].value,
        "allow_negative": li["H6"].value,
        "baselines": {p: li.cell(row=r, column=2).value
                      for p, r in zip(("RB", "WR", "QB", "TE"), (3, 4, 5, 6))},
        "starters": {p: li.cell(row=r, column=2).value
                     for p, r in zip(("RB", "WR", "QB", "TE"), (13, 14, 15, 16))},
    }


def players(wb, pos):
    ws = wb[pos]
    out = []
    for r in range(3, ws.max_row + 1):
        if not ws.cell(r, COL["player"]).value:
            continue
        out.append({k: ws.cell(r, c).value for k, c in COL.items()} | {"row": r})
    return out


def check_pricing(cfg, pool):
    """The workbook prices every player as R*StarterPF + (S-R)*BenchPF.

    R (StartVBD)  = max(FPTS - FPTS of the last starter at the position, 0)
    S (BenchVBD)  = FPTS - FPTS of the last rostered player at the position
    Above the starter baseline S-R is a constant (the two baselines' point gap),
    so price is piecewise linear in FPTS with a kink at the starter baseline.
    """
    total = 0.0
    print(f"{'pos':4} {'players':>7} {'baseline':>8} {'starters':>8} "
          f"{'pt gap':>7} {'$ pool':>9} {'top price':>9}")
    for pos in SKILL:
        rows = pool[pos]
        base, starters = cfg["baselines"][pos], cfg["starters"][pos]
        fpts = sorted((p["fpts"] for p in rows), reverse=True)
        gap = fpts[starters - 1] - fpts[base - 1]
        for p in rows:
            r_exp = max(p["fpts"] - fpts[starters - 1], 0)
            s_exp = p["fpts"] - fpts[base - 1]
            price = r_exp * cfg["starter_pf"] + (s_exp - r_exp) * cfg["bench_pf"]
            for name, got, want in (("StartVBD", p["start_vbd"], r_exp),
                                    ("BenchVBD", p["bench_vbd"], s_exp),
                                    ("$", p["price"], price)):
                if abs(got - want) > 1e-6:
                    print(f"  MISMATCH {pos} {p['player']} {name}: "
                          f"sheet={got:.4f} model={want:.4f}")
        pot = sum(sorted((p["price"] for p in rows), reverse=True)[:base])
        total += pot
        print(f"{pos:4} {len(rows):7} {base:8} {starters:8} {gap:7.2f} "
              f"{pot:9.2f} {max(p['price'] for p in rows):9.2f}")
    print(f"\nsum of prices over the {sum(cfg['baselines'].values())} rostered "
          f"skill players = ${total:,.2f}")
    print(f"dollars the workbook set aside for skill players   = "
          f"${cfg['skill_dollars']:,.2f}")
    print("identity holds" if abs(total - cfg["skill_dollars"]) < 0.01
          else "IDENTITY BROKEN")


def check_sort_order(pool):
    print("\nrow order vs FPTS rank (position tabs are only re-sorted by macro):")
    for pos in SKILL:
        rows = pool[pos]
        off = [abs(p["rank"] - i - 1) for i, p in enumerate(rows)]
        print(f"  {pos:3} {sum(1 for o in off if o):3}/{len(rows):3} rows "
              f"displaced, worst = {max(off)}")


def check_market(wb):
    a = wb["Auction"]
    rows = [(a.cell(r, 1).value, a.cell(r, 2).value, a.cell(r, 6).value,
             a.cell(r, 11).value) for r in range(13, 589) if a.cell(r, 1).value]
    valued = [x for x in rows if isinstance(x[2], (int, float)) and x[2] > 0]
    ours = sum(x[2] for x in valued)
    theirs = sum(x[3] for x in valued if isinstance(x[3], (int, float)))
    print(f"\nprojected pool ${ours:,.2f} vs site pool ${theirs:,.2f} "
          f"over the same {len(valued)} players -> site prices run "
          f"{ours / theirs - 1:+.1%}")
    print("  (site defaults are published for 10-team leagues; the raw 'Site "
          "Skew' column does not correct for that)")
    missing = [x[0] for x in valued
               if not isinstance(x[3], (int, float)) or x[3] == 0]
    if missing:
        print(f"  valued players with no site price: {missing}")
    split = defaultdict(float)
    for n, pos, f, k in valued:
        split[pos] += f
    print("  budget split:", ", ".join(
        f"{p} {split[p] / ours:.1%}" for p in sorted(split, key=lambda p: -split[p])))


def check_tiers(pool):
    print("\ntier sizes (z-score cuts taken over every listed player):")
    for pos in SKILL:
        c = Counter(p["tier"] for p in pool[pos])
        print(f"  {pos:3} " + "  ".join(f"{k}:{v}" for k, v in sorted(c.items())))


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "2026_FantasyFootball_DeflatorsLeague.xlsm"
    wb = load(path)
    cfg = league(wb)
    print(f"{cfg['teams']}-team, ${cfg['budget']} budget, {cfg['roster']} roster "
          f"spots ({cfg['bench']} bench), method={cfg['method']}, site={cfg['site']}, "
          f"starter share={cfg['starter_pct']:.0%}")
    print(f"StarterPF=${cfg['starter_pf']:.4f}/pt  BenchPF=${cfg['bench_pf']:.4f}/pt  "
          f"ratio={cfg['starter_pf'] / cfg['bench_pf']:.2f}x\n")
    pool = {pos: players(wb, pos) for pos in SKILL}
    check_pricing(cfg, pool)
    check_sort_order(pool)
    check_market(wb)
    check_tiers(pool)


if __name__ == "__main__":
    main()
