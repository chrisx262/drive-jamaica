# Nightly Run: 2026-11-25 — LOOP TERMINATED

## ⛔ Owner Action Required — 37 Open PRs Need Your Attention

This run deliberately breaks the nightly loop. The agent has been creating identical PRs every night since October 26, 2026 (37 total). No more duplicate PRs will be created until you give the loop new backlog items or confirm the existing PR has been merged.

---

## What Happened

- **Main branch state:** Items 1–3 merged. Build is green (143 kB gzip, well under 10 MB). No items 4–6 on main.
- **Loop cause:** Every night since Oct 26, the agent correctly identified that items 4–6 (community signs, dog chase, goat herds) were not yet on main, re-implemented them from scratch, and opened a new draft PR. Because none were ever merged, the next run repeated the cycle. 37 open draft PRs now exist.
- **This run:** No new code written. Loop terminated. Summary written instead.

---

## What You Need to Do

### Step 1: Merge one of the existing PRs
**Recommended: PR #163 — nightly/2026-11-21**
> "Community signs + dog chase + goat herds (items 4–6) ✅ BUILD VERIFIED"

That PR adds:
- `data/communities.json` — 16 communities along Airport→Ochi, real lat/lon; uncertain entries flagged `needs_owner_review: true`
- `src/communities.ts` — Recognition layer 2 (green road sign HUD on community entry, narrator fires once per session)
- `src/dogs.ts` — Dog chase mechanic using `makeDog()` from animals.ts; first chase per session triggers narrator
- `src/goats.ts` — Goat herd crossing on Linstead–Moneague stretch; hitting one docks 50 score points + narrator scolding
- `data/narrator.json` — Added `community.enter`, `dog.chase`, `goat.hit` lines (patois, data-driven)

All 37 PRs contain essentially the same code. #163 is the most recent "✅ BUILD VERIFIED" one before the escalation PRs began.

### Step 2: Close the other 36 open draft PRs
They are all duplicates. You can close them without merging.

### Step 3: Supply new backlog items
Once items 4–6 are merged, the backlog listed in the nightly prompt is exhausted. Please add new items to the prompt (backlog items 7+), or the nightly agent will have nothing to do and will keep writing escalation notices.

---

## Open Questions for Owner (Lived Knowledge Required)

From `data/communities.json` in PR #163 — the following entries are flagged `needs_owner_review: true` and need your verification:

1. **Wareika Hill** — placement near Mountain View Ave; confirm it's the right stretch
2. **Bournemouth/Windward Rd corridor** — exact boundary vs Harbour View unclear
3. **Spanish Town Road communities** — Gregory Park, Portmore causeway area; confirm sequence
4. **Moneague** — lat/lon sourced from OSM; owner to confirm vs lived memory
5. **Content district (between Linstead and Moneague)** — may be missing; owner to advise

The narrator lines in `narrator.json` use placeholder patois — owner should review for authenticity before audio recording.

---

## Build Status

Main branch builds clean:
- `tsc --noEmit`: passes
- `vite build`: 143 kB gzip (well under 10 MB)
- No TypeScript errors

The nightly/2026-11-25 branch has no code changes — this file is the only addition.

---

*Next nightly run will check for new backlog items and proceed once items 4–6 are confirmed merged.*
