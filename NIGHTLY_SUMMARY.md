# Nightly Build Summary — 2026-11-24

## ⛔ ACTION REQUIRED: Merge blocker — 37 open PRs, agent blocked since October 2026

**The nightly agent has NOT created another duplicate implementation today.** This run exists solely to escalate the merge blocker clearly.

---

## Situation

The main branch (`ab692e93`) has not moved since before October 2026. Backlog items 4-6 are **complete and build-verified** but none have been merged. As of today:

- **37 open draft PRs** all implement the same backlog items 4-6 (community signs, dog chase, goat herds)
- The best complete implementation is **PR #163** (`nightly/2026-11-21`): community signs + dog chase + goat herds, build verified
- Main is still missing: `data/communities.json`, `src/dogs.ts`, `src/goats.ts`
- Every nightly run re-implements the same work because it correctly detects main hasn't moved

## What the owner must do (one action)

**Merge PR #163** ("Nightly: 2026-11-21 — Community signs + dog chase + goat herds (items 4–6) ✅ BUILD VERIFIED").

That PR covers all three remaining backlog items (4, 5, 6) in a single clean implementation. After that merge:
- Main will have all V1 backlog items complete
- The nightly agent will stop looping
- All 36 other open PRs can be closed as superseded

If PR #163 has conflicts, any of PRs #162, #161, #160, #158 carry the same implementation and should also build cleanly.

## What the nightly agent will do once main is updated

The backlog will be exhausted. The agent will notify you and await new backlog items. Candidates for new backlog entries (owner to decide scope and priority):
- Kingston traffic NPC system (GAME_SPEC.md: Windward Rd / Half Way Tree gridlock + Monster Truck transformation)
- Faith's Pen stop mechanic (pull-over, jerk chicken, tyre repair)
- Landmark popup system wired to `data/landmarks.json`
- Multiplayer WebSocket server skeleton (position sync, ambient presence)
- Road callout HUD (recognition layer 1: street-name signs on turn)
- Dunn's River Falls cinematic finale

## Open questions needing owner's lived knowledge

1. **Community signs**: the data in the existing PRs (populated via OSM/research) contains entries marked `"needs_owner_review": true`. The owner should verify accuracy before shipping — especially smaller districts and their exact road positions.
2. **Dog placement**: the dog spawn zones are approximated to "towns along route." Owner should confirm which specific stretches feel right (e.g., does Bog Walk get dogs, or is it too rural?).
3. **Goat crossing stretch**: spec says Linstead–Moneague. Owner to confirm this is correct / whether to extend to Moneague–Faith's Pen.

---

*This summary was written by the nightly build agent. No code changes were made in this run — the agent deliberately withheld further duplicate work pending the owner's merge action.*
