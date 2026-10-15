# Nightly Run — 2026-06-22

## What was built

**Billboard system** — PR #12 (draft), branch `nightly/2026-06-22`.

This is the CLAUDE.md standing rule: every billboard/ad surface must get a unique stable ID from the moment it is created so the future self-serve Phase-2 ad portal can key on them without a migration.

### Files changed
| File | Change |
|---|---|
| `data/billboards.json` | **NEW** — 19 billboard placements, lat/lon + stable id + side + variant + notes |
| `src/billboards.ts` | **NEW** — `Billboards` class (tiny public API matching `potholes.ts`) |
| `src/main.ts` | Wires `Billboards` into the real-route branch |

### 19 billboard placements
Palisadoes (3), Sir Florizel Glaspole Blvd (2), Windward Road (1), Mountain View Ave (1), Half Way Tree area (2), Nelson Mandela Highway (1), Bog Walk Gorge (1), River Road (1), Linstead (2), Faith's Pen approach (1), Moneague (1), Fern Gully (1), Ocho Rios (2).

### 4 placeholder creative variants (canvas-generated, shared textures)
- **a** — Jamaica green / yellow: "ADVERTISE HERE / drive-jamaica.com"
- **b** — Jamaica yellow / black: "BIG UP JAMAICA / drive-jamaica.com"
- **c** — black / yellow: "DRIVE LEFT, MON / ALWAYS. NO EXCEPTIONS."
- **d** — Jamaica green / white: "FAITH'S PEN / BEST JERK IN JAMAICA"

### Build
`tsc --noEmit` ✅  `vite build` ✅  Gzip output: 144 KB (well under 10 MB limit).

---

## What the owner should review

1. **Drive the route** and check billboard positions. The lat/lon came from route-point interpolation; some may need nudging in `data/billboards.json`.
2. **Palisadoes side** — `bb-palisadoes-02` (right / open-sea side). If it looks like it's in the water, flip to `"side": "left"`.
3. **Bog Walk Gorge** (`bb-bogwalk-01`) — the gorge is narrow; if there's no real verge there remove or reposition the entry.
4. **Fern Gully density** — 1 billboard placed to keep the canopy feeling natural. Owner may want 0 or more.
5. **Stable IDs** — once this PR merges, IDs must never change. If you want to remove a billboard, set `"retired": true` rather than deleting the entry.

---

## Open questions for owner's lived knowledge

- Any billboard positions obviously wrong from memory?
- How many billboards on the Palisadoes strip feels right? (Currently 3.)
- Should the narrator call out any specific billboard (e.g. at Faith's Pen)? Easy to add to `narrator.json`.

---

## Decisions made

- IDs encoded as descriptive slugs (`bb-location-nn`), not UUIDs — readable in data files, stable as long as slugs are treated as immutable.
- Canvas texture over a font atlas / SVG — zero extra dependencies; 512×256 is plenty at in-game viewing distances.
- `group.lookAt(roadPos)` for face orientation — cleaner than manually computing rotation.y.
- No `update()` method — billboards are static objects in V1.

---

## Next backlog item

All 6 original backlog items are in open PRs. Remaining V1 features from GAME_SPEC.md not yet in any PR:

1. **Cow herder event** (smallest scope — `makeCow()` already in `src/animals.ts`; completes the animal-hazard trio)
2. **Monster truck transformation** (frustration meter + Kingston traffic; most complex remaining V1 mechanic)
3. **Off-road mountain moment** (wrong-turn at Moneague)
4. **Multiplayer** (WebSocket position sync, ambient, V1 no-collision)

**Suggested next night: cow herder event.**
