# CLAUDE.md — Drive Jamaica

## What this project is
A lightweight multiplayer browser driving game set in Jamaica, in the spirit of fly.pieter.com. Full design in `GAME_SPEC.md` — read it before any substantive work.

## Standing rules
- All docs, design notes, and decisions get written as markdown and synced to the owner's Obsidian vault as well as committed to this GitHub repo. Ask for the vault path if not configured.
- Commit early and often with clear messages; push to GitHub at the end of every working session.
- Keep the game lightweight: target < 10 MB initial load, 60 fps on a mid-range phone browser. Reject heavy dependencies by default.
- Driving is on the LEFT. Always.
- Narrator lines are data-driven (JSON event→line mapping), never hardcoded.
- Billboard/ad surfaces each get a unique stable ID from the moment they're created — the future self-serve ad system depends on it.

## Tech stack (decided — don't relitigate without owner approval)
- Three.js + TypeScript + Vite frontend
- Node.js WebSocket server for ambient multiplayer (position sync only in V1)
- GLB assets from MagicaVoxel/Blockbench
- OSM (Overpass API) → simplified polylines → runtime road-ribbon generation
- Static hosting (Cloudflare Pages/Vercel) + small WS server (Fly.io/Railway)

## V1 scope guardrails
One route only — the scenic road: Norman Manley Airport → Kingston → Bog Walk gorge → Linstead → Moneague → Faith's Pen → Fern Gully → Ocho Rios (ends at Dunn's River Falls, cinematic bath finale). No accounts, no races, no player collisions, no ad backend. If a task drifts beyond this, flag it instead of building it.

## Conventions
- TypeScript strict mode; small modules; no framework unless justified.
- World/route data lives in `data/` as JSON; assets in `assets/` as GLB; narrator audio in `assets/voice/`.
- Each gameplay system (potholes, dogs, goats, traffic, narrator, billboards) is its own module with a tiny public API.
