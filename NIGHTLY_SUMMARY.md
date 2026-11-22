# Nightly Summary — 2026-11-22

## ⛔ AGENT LOOP DETECTED — ACTION REQUIRED

The nightly build agent has been redoing the same work every single night since
approximately **18 October 2026**. As of today there are **33 consecutive open
PRs** (PR #133 through PR #163) each containing identical implementations of
backlog items 4–6. This is 34 wasted agent runs.

**Root cause:** main has never been updated after item 3 merged. The agent
correctly detects that items 4–6 are absent from main, implements them, opens a
PR, and stops — but without a merge, the next night's run finds the same gap and
starts over.

---

## What to do right now

1. **Merge PR #163** (`nightly/2026-11-21`) — it is the most recent,
   build-verified implementation of items 4–6 and is marked clean/mergeable.
   All 33 earlier PRs contain the same code; they can be closed as duplicates
   after #163 merges.

2. **Close PRs #133–#162** as duplicates — or leave them; they won't cause
   conflicts once #163 merges and the branch list is cleaned up.

3. **Add new backlog items to the nightly prompt.** Once #163 merges, the agent
   will find items 4–6 in main and advance. But the written backlog ends at
   item 6. Without new items, tomorrow's run will open yet another "backlog
   exhausted" escalation PR. Candidates from GAME_SPEC.md that have not been
   started:
   - Cow herder event (man with cows blocking country road, Moneague stretch)
   - Faith's Pen stop mechanic (pull over, eat, repair tyres, narrator line)
   - Monster truck transformation (frustration meter fills in Kingston traffic)
   - NPC Kingston traffic (serious gridlock on Windward Rd / Half Way Tree)
   - Scoring module (potholes, goats spared, near-misses, style)

---

## What is in PR #163

| Feature | Files | Status |
|---|---|---|
| Community signs (`data/communities.json` + `src/communities.ts`) | 2 | ✅ build verified |
| Dog chase mechanic (`src/dogs.ts`) | 1 | ✅ build verified |
| Goat herd crossing (`src/goats.ts`) | 1 | ✅ build verified |
| Narrator lines (`data/narrator.json`) | 1 (updated) | ✅ build verified |

16 communities along the full Airport→Ochi route; 7 marked
`needs_owner_review: true` (Rockfort, Vineyard Town, Cross Roads, Three Miles,
Sligoville, Fern Gully, Ewarton) — the owner's lived knowledge is authoritative
for placement corrections.

---

## Open questions needing owner's lived knowledge (from PR #163)

1. **Rockfort** — does the route pass *through* Rockfort village, or just past
   the industrial area?
2. **Three Miles** — is "Three Miles" the right name, or would locals say
   something else for that stretch of Spanish Town Road?
3. **Vineyard Town / Rollington Town** — which name do locals use for the
   Mountain View Avenue stretch?
4. **Sligoville** — does the route actually pass through Sligoville town, or
   just skirt it?
5. **Fern Gully** — should the community sign fire at the top, middle, or
   bottom of the gully? Or should it remain a landmark-only entry (layer 3)?
6. **Ewarton** — confirm it's on the route (map says yes; lived knowledge is
   the authority).

---

## Build status

✅ main branch builds clean (`tsc --noEmit && vite build`). No regressions.
No code was changed on this branch — it is a status-only PR.

## Today's branch: `nightly/2026-11-22`

No new code. This run's job was to detect and report the loop clearly so the
owner can unblock it in one action (merge PR #163).
