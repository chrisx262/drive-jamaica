# Nightly Build Summary — 2026-10-28

## ⚠️ ACTION REQUIRED: 30 open PRs need your review

**The nightly build has been creating a new PR every night for backlog items 4-6
since 2026-09-28 (30 consecutive nights). None have been merged.**

The work in these PRs is correct and build-verified. The cycle will repeat every night
until you merge one. **Please merge PR #138 (or close the others) to unblock the
nightly build.**

---

## What's in PRs 109–138 (items 4, 5, 6 — all identical in substance)

### Item 4: Community signs data (`data/communities.json` + `src/recognition.ts` layer 2)
18 communities along the Airport→Ochi route, each with name, lat/lon, and optional note.
Entries marked `needs_owner_review: true` need your lived knowledge to verify:
- Rockfort, Windward Road, Mountain View, New Kingston, Liguanea — route alignment uncertain
- Bog Walk, Flat Bridge — coordinates need local confirmation
- Ewarton, Golden Spring — included based on map data; may be off-route

Entries the PRs are confident about (no review flag):
Palisadoes, Harbour View, Half Way Tree, Spanish Town, Linstead, Moneague, Faith's Pen,
Fern Gully, Ocho Rios.

The layer 2 HUD sign is styled with Jamaican green/gold — a district sign feel.
Narrator fires `community.enter` ("Welcome to {community}, star!" / "Big up {community}!")
on first pass.

### Item 5: Dog chase mechanic (`src/dogs.ts`)
- Uses `makeDog()` from `src/animals.ts` (the placeholder builder you wrote).
- Dogs placed on town road segments: Sir Florizel Glaspole Blvd, Windward Rd,
  Mountain View Ave, Hagley Park Rd, Main Rd (Linstead), King's St (Linstead),
  DaCosta Dr (Ochi), Northern Coastal Hwy.
- Trigger radius 18 m; chase speed 7 m/s; dog gives up after 9 s.
- Narrator fires `dog.chase` once per session ("Dog ah run yuh dung, boss!").
- Segment names verified against `data/route.json` — all match exactly.

### Item 6: Goat herd crossing (`src/goats.ts`)
- Uses `makeGoat()` from `src/animals.ts`.
- Herds on country-road segments: Linstead–Moneague Road, Pleasant Farm Road.
- Herd size 3–6 goats; herds cross when car comes within 40 m.
- Hitting a goat: `narrate('goat.hit')` fires ("Yuh lick dung di goat! Wicked!" / etc.).
- Segment names verified against `data/route.json` — all match exactly.

---

## Why 30 PRs have piled up

The nightly task description says to check open PRs and "never redo completed work."
But that check wasn't working correctly in previous runs: each night the agent looked at
main (which doesn't have items 4-6) and concluded the work wasn't done. Result: a new
PR every night.

---

## Recommended owner action

1. **Open PR #138** (nightly/2026-10-27 — the most recent, cleanest version).
2. Review `data/communities.json` — flag `needs_owner_review: true` entries that are
   wrong or off-route; delete or correct them.
3. Merge PR #138.
4. Close PRs #109–137 (they're duplicates of #138; no useful diff between them).

After merge, the next nightly will move to item 7 (new backlog item — see below).

---

## Proposed next backlog items (V1 scope)

Once items 4-6 land on main, the remaining V1 features from GAME_SPEC are:

7. **Scoring module** — distance, near-misses (pothole dodges), style swerves, tyres burst,
   goats spared. Simple accumulator module; score display on HUD.
8. **Pothole tyre shop** — roadside repair stops; tyre fixed = narrator line + handling
   restored. The potholes module is already on main; this closes the loop.
9. **Faith's Pen stop mechanic** — optional pull-over; eating restores tyres + brief boost;
   narrator celebrates. The location is already in `data/communities.json` (in open PRs).
10. **Kingston NPC traffic** — serious gridlock on Windward Rd / Half Way Tree area; NPC
    cars as obstacles; fills the frustration meter for the monster truck transform.

Items 11+ (monster truck, cow herder, Dunn's River Falls finale, multiplayer) are larger
and should be sequenced after the core loop (7–10) is playable.

---

## Build status

No code changes this run. Main branch builds clean (`tsc --noEmit && vite build` passes).
This branch contains only this summary file.
