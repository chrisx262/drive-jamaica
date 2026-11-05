# Nightly Summary — 2026-11-05

## ⛔ SECOND CONSECUTIVE NO-CODE RUN — OWNER ACTION REQUIRED

No new code was produced. The backlog is exhausted and has been for two consecutive nights.
This is a holding PR only.

---

## Status at a glance

| Backlog item | Status |
|---|---|
| 1. Test-track + debug visuals | ✅ Merged to main |
| 2. CC0 asset integration | 🕐 Open PR — awaiting merge (nightly/2026-06-13) |
| 3. Overpass scatter | 🕐 Open PR — awaiting merge (nightly/2026-06-14) |
| 4. Community signs data | ✅ Done — **30+ open PRs** (#116–145); best is **PR #145** |
| 5. Dog chase mechanic | ✅ Done — included in PR #145 |
| 6. Goat herd crossing | ✅ Done — included in PR #145 |

**Main branch is frozen at the CC0-assets commit.** Because items 4–6 were never merged, every
nightly run re-builds them from the same base, creating another duplicate PR. The cycle will
repeat each night until the owner merges.

---

## Immediate owner actions needed

### 1. Merge PR #145 (priority)

PR #145 (`nightly/2026-11-03`) is the cleanest, most recent complete implementation of items 4–6:

- `data/communities.json` — 11 communities along the Airport → Ochi route  
- `src/dogs.ts` — dog chase mechanic (uses `makeDog()` from `src/animals.ts`)  
- `src/goats.ts` — goat herd crossing (uses `makeGoat()` from `src/animals.ts`)  
- Narrator lines added for `community.enter`, `dog.chase`, `goat.hit`  
- Build verified: `tsc` clean, Vite output ~143 KB gzip (well under 10 MB)

### 2. Close PRs #116–144 (superseded duplicates)

All 29 of these implement the same items 4–6. Once #145 is merged they are redundant.
Close without merging.

### 3. Supply new backlog items to the nightly prompt

Once items 1–6 land on `main`, the nightly agent needs new tasks. Ready-to-build V1 features
from GAME_SPEC.md that fall within V1 scope:

- **Scoring module** — distance, near-misses, style swerves, tyres burst, goats spared  
- **Faith's Pen stop** — optional pull-over, eat jerk chicken, tyre damage repaired, narrator  
- **Landmark popups** — recognition layer 3 (Devon House, Half Way Tree clock, Bob Marley
  Museum, Flat Bridge / Bog Walk, Dunn's River Falls, Excelsior High, etc.)  
- **NPC Kingston traffic** — gridlock density in Windward Rd / Half Way Tree sections  
- **Billboard IDs** — every billboard surface needs a unique stable ID (CLAUDE.md standing rule)  
- **Narrator audio scaffolding** — Howler.js stub + audio-sprite loader, wired to narrator.json  
- **Cow herder event** — man + cows blocking country road, player swerves  
- **Monster Truck frustration meter** — charges in traffic, transformation + crusher mechanic

---

## Open questions from earlier runs (owner's lived knowledge required)

These are still unresolved from PR #145:

1. **Rockfort** — is "Rockfort" the right community name, or is "Rockfort Industrial Estate" / 
   "Rockfort area" more natural to residents? Should it be listed separately from Harbour View?
2. **Spanish Town bypass** — does the route actually pass through or skirt Spanish Town? The
   communities.json has an entry marked `needs_owner_review: true`.
3. **Fern Gully sign** — the in-game community sign reads "Fern Gully" — is there a formal
   community/district name, or is Fern Gully (the road) the recognised name?
4. **Missing communities** — are there communities between Half Way Tree and the Spanish Town
   Road turnoff that should have recognition signs? (e.g. Arnett Gardens / Trench Town area)
5. **Moneague / Cave Valley** — the route passes through or close to both. Which gets a sign?
   Is "Cave Valley" on this leg or further north?
6. **Faith's Pen** — communities.json lists it as a community. Should the in-game sign read
   "Faith's Pen" or "Guys Hill / Faith's Pen"?

---

## Why this keeps happening

The nightly agent checks whether items 4–6 exist **on `main`**. They don't — main hasn't been
updated since the CC0 assets commit in June. So each night the agent sees them as undone,
re-builds them, opens another PR, and the pile grows by one.

**Merging PR #145 breaks the loop.**

---

*No code changes in this run. Branch exists solely to deliver this summary.*
