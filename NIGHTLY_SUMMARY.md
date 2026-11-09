# Nightly Summary — 2026-11-09

## ⛔ ACTION REQUIRED: 31 open PRs unmerged — build agent is blocked

**No new code was written tonight.** Writing a 32nd implementation of the same items 4-6
would be pure waste. This summary is the deliverable.

---

## Situation

| Backlog item | Status |
|---|---|
| 1. Test-track scene + debug viz | ✅ Merged to main |
| 2. CC0 asset integration | ✅ Merged to main |
| 3. Overpass scatter | ✅ Merged to main |
| 4. Community signs data | ✅ Done in 31 open PRs — **none merged** |
| 5. Dog chase mechanic | ✅ Done in 31 open PRs — **none merged** |
| 6. Goat herd crossing | ✅ Done in 31 open PRs — **none merged** |

The first open PR implementing items 4-6 is **PR #120** (nightly/2026-10-10).
The most recent and cleanest is **PR #150** (nightly/2026-11-08), merged 1 day ago — build verified, tsc clean, 146 kB gzip.

## What you need to do

### Step 1 — Merge PR #150
Go to: https://github.com/chrisx262/drive-jamaica/pull/150

It includes:
- `data/communities.json` — 17 communities along the full route with lat/lon and cultural notes (several marked `needs_owner_review: true` awaiting your lived knowledge)
- `src/dogs.ts` — dog chase mechanic (urban roads, narrator fires once per session)
- `src/goats.ts` — goat herd crossings (Linstead–Moneague roads, score penalty on hit)
- `src/recognition.ts` updated with layer-2 community sign HUD
- `data/narrator.json` updated with `community.enter`, `dog.chase`, `goat.hit` lines

After merging PR #150, **close all other open PRs** (#120–#149) as duplicates.

### Step 2 — Supply new backlog items
Once items 4-6 are in main, the entire current backlog is exhausted. The nightly agent
will stall again without new items. Candidates from GAME_SPEC.md still pending in V1:

- Faith's Pen stop mechanic (pull over, eat jerk chicken, tyre damage repaired)
- Scoring module (distance, near-misses, style swerves, tyres burst, goats spared)
- Kingston traffic (NPC gridlock on Windward Rd / Half Way Tree, frustration meter)
- Monster truck transformation (traffic crush, flattened NPC cars, narrator "BIG TRUCK TING!")
- Cow herder event (man + cows blocking country road)
- Multiplayer server (Node.js + ws, position broadcast)
- Dunn's River bath finale (cinematic end screen)

Add these to the nightly prompt or tell me which one is next priority.

## Open questions from PR #150 (your lived knowledge needed)

1. Is **Ewarton** directly on the route, or does the road bypass it on the way from Linstead to Moneague?
2. Does the route pass through **Spanish Town** proper, or only the Spanish Town Bypass?
3. Is **Claremont** the right community on the descent from Moneague toward Fern Gully, or is there a more recognizable name?
4. Is **Angels** the correct community name at the Bog Walk Gorge entrance?
5. The community sign HUD currently shows green-on-dark-green (Jamaican road sign style) — does this look right to you?
