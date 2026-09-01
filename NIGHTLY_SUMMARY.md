# Nightly Summary — 2026-09-01

## ⚠️ Action Required: 30 Unmerged PRs — Agent Loop Detected

The nightly build agent has been running every day since 2026-08-02 and has
opened **30 consecutive draft PRs** (#52–#81) all implementing the same three
backlog items (community signs, dog chase, goat herd). None have been merged.
**Main has not changed since at least early August.**

The agent is stuck in a loop because it correctly identifies that items 4–6
are unfinished on `main` and re-implements them each night.

---

## What you need to do

### Step 1 — Merge PR #81 (the canonical version)

**PR #81 (`nightly/2026-08-31`)** is the most recent and cleanest implementation.
It adds 456 lines across 6 files, build verified:

- `data/communities.json` — 14 communities along the full route, 6 marked
  `needs_owner_review` (coords to verify with your lived knowledge)
- `src/recognition.ts` — extended with community sign layer (layer 2)
- `src/dogs.ts` — dog chase mechanic; town dogs in Kingston, Spanish Town,
  Linstead; uses `makeDog()` from `animals.ts`; narrator fires once per session
- `src/goats.ts` — goat herd crossing on Linstead–Moneague stretch; collision
  triggers narrator scolding; uses `makeGoat()` from `animals.ts`
- `data/narrator.json` — `community.enter`, `dog.chase`, `goat.hit` lines added

To merge: https://github.com/chrisx262/drive-jamaica/pull/81

### Step 2 — Close PRs #52–#80 as superseded

All 29 older PRs are identical in substance to #81. Once #81 is merged,
close the rest with comment "Superseded by #81."

---

## Open questions from PR #81 (your lived knowledge needed)

1. **Community coords** — 6 entries flagged `needs_owner_review` in
   `data/communities.json`. The coordinates are OSM-sourced; your sense of where
   each community "feels like it begins" on the road is more accurate.
2. **Dog zones** — current point-index ranges: Kingston pts 62–129,
   Spanish Town 226–250, Linstead 342–391. Correct?
3. **Goat zone** — Linstead–Moneague pts 391–628. Should goats start later
   (more purely rural)?
4. **Dog tuning** — `WAKE_RADIUS=28 m`, `DOG_SPEED=7.5 m/s`,
   `GIVE_UP_DIST=90 m` — all at top of `src/dogs.ts`, easy to adjust.

---

## What comes next after merge

All six original backlog items will be complete. Candidates for next priority
(owner to decide):

- Kingston traffic NPCs + monster truck transformation mechanic
- Faith's Pen cookshop stop (tyre repair + narrator celebration)
- Multiplayer WebSocket position sync server (Node.js + `ws`)
- Narrator voice line recording / audio sprite integration

---

## This PR

This branch contains only this summary document. No code was duplicated.
The nightly agent will remain stuck on the same items until PR #81 lands on
main — merging it is the single action that unblocks all forward progress.
