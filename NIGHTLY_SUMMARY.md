# Nightly Build Status — 2026-11-23

## ⛔ CRITICAL: 36+ duplicate PRs — owner action required

**Today's agent did NOT re-implement any work.** See explanation below.

---

## Situation

The nightly agent has been stuck in a loop **since at least October 18, 2026** — over 5 weeks.

**Root cause:** The nightly agent runs off `main`. Main has not been updated since the CC0 asset
integration commit (`ab692e9`). Every night the agent sees backlog items 4–6 not on main, implements
them from scratch on a new branch, opens a new draft PR, and exits. The next night: same thing.

**Result as of 2026-11-23:** ~36 open draft PRs all implementing the identical work:
- Items 4–6: community signs, dog chase mechanic, goat herd crossing
- PRs #135 through #164, all targeting `main` at the same commit
- Branches `nightly/2026-10-24` through `nightly/2026-11-22`

---

## What the owner must do RIGHT NOW

**Merge PR #163** (nightly/2026-11-21 — "Community signs + dog chase + goat herds (items 4–6) ✅ BUILD VERIFIED").

That PR contains the complete, build-verified implementation of backlog items 4, 5, and 6:
- `data/communities.json` — 30 communities along the full route with lat/lon and notes
- `src/dogs.ts` — dog chase module with public API matching potholes.ts pattern
- `src/goats.ts` — goat herd crossing module with score penalty + narrator
- Narrator lines wired in `data/narrator.json`
- `npm run build` passes ✅

After merging PR #163:
1. The nightly agent will correctly detect items 4–6 as done.
2. The backlog is then **exhausted** — there are no more items listed.
3. The owner should supply new backlog items, or the agent will produce a "backlog exhausted" notice each night.

---

## What the owner should do after merging

1. **Close all duplicate PRs** (#135–#162, #164) — they are all superseded by #163.
2. **Supply new backlog items** (append to the BACKLOG section in the nightly prompt).
   Candidates from GAME_SPEC.md:
   - Kingston traffic NPC system
   - Monster truck transformation mechanic
   - Faith's Pen stop interaction
   - Landmark popup system (road callouts + name signs)
   - Dunn's River bath finale cinematic
   - Multiplayer WebSocket server scaffold

---

## This run

- Branch: `nightly/2026-11-23`
- No new code committed — avoiding yet another duplicate implementation
- Build: not run (nothing changed from main; prior verified build is in PR #163)
- Next backlog item when unblocked: **owner to supply** (backlog is exhausted)

---

## Open questions for the owner (unchanged from prior runs)

1. **Community name review** — `data/communities.json` in PR #163 has entries marked `"needs_owner_review": true` where research was uncertain. Owner's lived knowledge is authoritative.
2. **New backlog items** — after merging, what comes next?
3. **Voice talent** — narrator audio sourcing (open since V1 planning).
