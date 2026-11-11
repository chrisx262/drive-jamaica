# Nightly Run: 2026-11-11

## ⛔ ACTION REQUIRED — 152 UNMERGED PRs: BUILD AGENT IS STUCK

### What happened tonight

This run was **not** a build run. It produced no code changes.

The nightly agent checked all open PRs before starting work, as instructed. It found **152 open PRs** (PR #1–#152) all targeting `main`, all implementing the **same** backlog items 4–6 (community signs, dog chase, goat herds). Every single one was created because `main` has not advanced since the initial setup — it still sits at SHA `ab692e93e1d0cee9d8e0d991a64830505336ecf2`.

Creating PR #153 with the same code would add noise, not value. The nightly agent's own instruction says "never redo completed work" — that work is complete, it just isn't merged.

### The root cause

The nightly agent runs every night, checks whether backlog items 4–6 are present on `main`, finds they are not (because nothing has been merged), implements them again, and opens another PR. This will continue indefinitely until a PR is merged into `main`.

### What you need to do

1. **Pick one PR and merge it.** The most recent clean implementation is **PR #152** (`nightly/2026-11-10`). Merge that one.
2. **Close the other 150+ PRs** — they are all duplicates. You can bulk-close via the GitHub UI or CLI:
   ```
   gh pr list --state open --limit 200 | grep "nightly/" | awk '{print $1}' | head -151 | xargs -I {} gh pr close {}
   ```
3. Once `main` advances, tomorrow's nightly run will see items 4–6 as done and move on to new work.

### What items 4–6 contain (in PR #152)

- **`data/communities.json`** — 30+ communities/districts along the full Airport→Kingston→Bog Walk→Fern Gully→Ochi route, with lat/lon. Entries the agent was uncertain about are marked `"needs_owner_review": true`. **Owner should review these** — your lived knowledge is authoritative.
- **`src/dogs.ts`** — Dog chase mechanic. Dogs appear in towns; a dog chases the car when it passes within range. Uses `makeDog()` from `src/animals.ts`. Narrator fires once per session on first chase.
- **`src/goats.ts`** — Goat herd crossing mechanic. Goats cross country roads (Linstead–Moneague stretch). Hitting one: score penalty + narrator scolding. Uses `makeGoat()` from `src/animals.ts`.

### Open questions for the owner

These require your lived knowledge and cannot be answered from map data alone:

- **Community names/spellings**: Several communities are marked `needs_owner_review` in `data/communities.json`. Please correct spellings and add any missing communities you know personally.
- **Dog placement**: Which towns have the most notorious dog chasers? Kingston's dogs are in the spec; are there specific communities along the Linstead–Moneague stretch that are especially known for it?
- **Goat herd density**: Are goats equally common throughout the Linstead–Moneague stretch, or concentrated in particular spots?

### What comes next (once items 4–6 are merged)

The backlog as written will be exhausted after item 6. The agent will need new backlog items to continue. Candidates from the GAME_SPEC that haven't been built yet:
- **Cow herder event** — man with cows blocking the road, player must swerve
- **Monster Truck transformation** — frustration meter + traffic crush
- **Kingston traffic NPC system** — gridlock in Windward Rd / Half Way Tree area
- **Landmark popups** — data-driven in-game info cards for Devon House, Bob Marley Museum, etc.
- **Faith's Pen stop** — optional pull-over for jerk chicken, tyre repair, narrator celebration
- **Dunn's River Falls finale** — cinematic end sequence

If you add these to the backlog in the nightly prompt, the agent will start building them once the current items are merged.
