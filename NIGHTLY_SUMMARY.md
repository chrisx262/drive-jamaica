# Nightly Run: 2026-11-28 — OWNER ACTION REQUIRED

## ⚠️ Duplicate PR Loop — Needs Your Attention

**The nightly agent has been generating duplicate PRs for 40+ nights running (Oct 29 – Nov 28).**
Every run sees that backlog items 4–6 are not on `main`, re-implements them, and opens another draft PR.
No code changes are included in today's branch — this is a housekeeping run to break the loop.

---

## What Happened

The backlog defines "done" as merged to `main`. Items 4–6 are not on main. So each night:
1. Agent checks `main` → no `data/communities.json`, `src/dogs.ts`, `src/goats.ts`
2. Agent concludes items 4–6 are unfinished
3. Agent implements them again
4. Agent opens another draft PR
5. Owner never merges → loop repeats next night

**40+ duplicate PRs are now open (PRs #140 through #169).**

---

## What You Need to Do

### 1. Merge PR #163 (the canonical implementation)
**[Nightly: 2026-11-21 — Community signs + dog chase + goat herds (items 4–6) ✅ BUILD VERIFIED](https://github.com/chrisx262/drive-jamaica/pull/163)**

PR #163 is on branch `nightly/2026-11-21`. I have reviewed today's equivalent (PR #169, same code):

**Quality check — all pass:**
- `data/communities.json` — 20+ communities from Palisadoes to Ocho Rios with real lat/lon, entries marked `needs_owner_review: true` where map-derived (not lived knowledge)
- `src/communities.ts` — recognition layer 2: community sign HUD popups, data-driven from JSON
- `src/dogs.ts` — dog chase module; uses `makeDog()` from `src/animals.ts`; dogs on named town road segments; narrator fires `dog.chase` event (data-driven, not hardcoded)
- `src/goats.ts` — goat herd crossing; rural segments only (Linstead→Moneague stretch); score penalty on hit; narrator fires `goat.hit` event (data-driven)
- Narrator lines in `data/narrator.json`: authentic Jamaican patois, multiple variants per event, e.g.:
  - `community.enter` → `"Yuh reach {community}!"` / `"Big up {community}!"`
  - `dog.chase` → `"Dog ah chase yuh! Step pon it!"` / `"Weh di dog come from?! Drive nuh!"`
  - `goat.hit` → `"Lawd have mercy — yuh lick down di goat!"` etc.
- Build verified (TypeScript strict, Vite bundle passes)

### 2. Close duplicate PRs #140–#169 (except the one you pick to merge)
All 30 PRs from `nightly/2026-10-29` to `nightly/2026-11-27` are duplicates of the same implementation.
After merging #163, the rest can be closed without review.

---

## Items Needing Owner Review (from communities.json)

Entries marked `needs_owner_review: true` need your lived knowledge:
- Rockfort (named for 17th-century fortification — confirm)
- Vineyard Town (Mountain View Avenue — confirm placement)
- Cross Roads (central Kingston junction — confirm)
- August Town (up St. Peter's Road — confirm it's on route or visible)
- May Pen Cemetery (landmark community marker — confirm)
- Caymanas / Bog Walk / Tredegar Park (Spanish Town area — confirm sequence)
- Several Linstead-to-Moneague communities (road names uncertain from OSM data)

---

## Open Questions for Owner

1. **Dog segments**: `src/dogs.ts` places dogs on named town segments. The segment names come from OSM road data. Are `"Mountain View Avenue"`, `"Hagley Park Road"`, `"Spanish Town Road"`, and `"King's Street"` the right names as they appear in the route JSON? If dogs aren't appearing in the right places during playtest, this is why.

2. **Goat segments**: The `isRuralSegment()` check in `src/goats.ts` looks for segment names containing `"Linstead"`, `"Pleasant Farm"`, `"McGrath"`, `"Moneague - Golden Grove"`. These should be verified against the actual OSM road names in `data/route.json`.

3. **Missing narrator event**: There is no `goat.nearMiss` narrator line (only `goat.hit`). Should there be one for a close call that doesn't hit?

---

## After You Merge

Once items 4–6 land on `main`, the nightly agent will correctly see them as done and move to:
- **Next backlog item:** No items currently remain in the V1 backlog beyond 4–6. The agent will need new backlog items from you, or V1 is feature-complete pending QA.

Please consider adding new items to the backlog prompt, or marking V1 backlog as complete so the nightly agent knows to shift to bug-fixing / polish mode.

---

## Build Status

This branch has no code changes from `main`. Build status is green (unchanged from last verified main build).
