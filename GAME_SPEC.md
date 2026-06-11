# Drive Jamaica
A lightweight multiplayer browser driving game set in Jamaica.

## Vision
Capture the chaos and joy of driving in Jamaica: potholes, dogs chasing the car, goat herds crossing country roads, a cow herder in the middle of the street, driving on the left, and accidentally off-roading down a mountainside. Built for the ~7M Jamaican diaspora and 1M+ annual tourists. The hook is **recognition** — real roads, real landmarks, real communities, real high schools, narrated by an authentic Jamaican voice.

Reference for feel and scope: fly.pieter.com (instant load, no install, ambient multiplayer, simple controls, big personality).

## Core Pillars
1. **Fun chaos** — driving hazards are the gameplay, not obstacles to it.
2. **Recognition** — diaspora players should see places they know and share clips because of it.
3. **Instant** — loads in seconds in any browser, worldwide, free.
4. **Voice** — Jamaican narrator reacts to everything ("Yuh tyre bust, brethren!").

## V1 Scope: The Airport Run
Single route — the scenic road (owner decision, 2026-06-10): Norman Manley International Airport → Palisadoes → Kingston (Windward Rd → through town, passing Half Way Tree) → Spanish Town Road out of the city → Bog Walk gorge (Flat Bridge) → Linstead → Moneague → **Faith's Pen** → **Fern Gully** → Ocho Rios, ending at Dunn's River Falls with the bath finale (see Gameplay).

The Kingston leg is curated for recognition (it threads past landmarks like Half Way Tree rather than taking the fastest real-world path). The toll highway and the Junction road (A3 via Castleton) are deferred — candidates for a route fork in a later version.

- Real road geometry extracted from OpenStreetMap (simplified polyline → generated road ribbon).
- Stylized low-poly/voxel surroundings, procedurally scattered along the route.
- Hand-built voxel landmarks placed at real locations (see Landmarks list).
- Drive on the LEFT. Oncoming traffic enforces it.

### Roadmap after V1
- **V2: Kingston open city** — explorable grid, communities, prominent high schools as landmarks.
- **V3: Whole island (lite)** — full ring road network, Montego Bay, Negril, Port Antonio, etc.
- Race mode (Kingston → Ochi time trials, head-to-head) layered on existing multiplayer plumbing.

## Gameplay (V1)
- **Arcade driving model** — kinematic, forgiving, fun-first. No realistic sim physics. Steering authority attenuates with speed (owner feedback 2026-06-10: full-rate steering at speed felt too sensitive).
- **World scale (owner decision, 2026-06-10): compress for fun.** Real OSM geometry scaled to ~30% distance, so the full Airport→Ochi run is ~36 km (~15 min at top speed) instead of a 50-minute literal drive. Road shapes and turn-by-turn names stay real.
- **Potholes**: scattered on road; hitting one at speed damages a tyre → handling penalty + narrator line. Fixable at roadside "tyre shop" stops. **Owner rule (2026-06-10): the Palisadoes airport road is pothole-free** — government maintains the showcase road out of the airport — **potholes begin just past the Harbour View roundabout.**
- **Dogs**: chase and bark at the car through towns; city dogs in Kingston famously look both ways before crossing.
- **Goat herds**: cross country roads unattended; hitting one has consequences (score/damage + narrator scolding).
- **Cow herder event**: man with cows blocking a country road — player must swerve into the bushes and back.
- **Off-road mountain moment**: a wrong turn option in the hill country (Moneague/Mount Rosser stretch) that becomes potholes-then-no-road on a mountainside.
- **Kingston traffic**: serious NPC gridlock in city sections (Windward Rd, Half Way Tree area). Traffic density is a gameplay feature, not background.
- **Monster Truck transformation**: being stuck in traffic fills a "frustration meter." When full, the player can transform into a monster truck, crush the cars ahead (cartoon-style flattening, no gore — flattened drivers shake fists), then auto-revert to the Corolla and keep moving. Limited duration; meter only charges in traffic so the mechanic appears exactly where it's needed. Narrator line on transform (e.g., "BIG TRUCK TING!"). V1: crushes NPC traffic only, never real players.
- **Faith's Pen stop**: optional pull-over at the famous roadside cookshops — jerk chicken, roast yam, festival. Eating repairs tyre damage and gives a short feel-good boost; narrator celebrates the tradition. Skippable, but the game makes it tempting.
- **Dunn's River bath finale**: the run ends at Dunn's River Falls with a short cinematic — the driver gets out and takes a cool bath under the waterfall, narrator congratulation, then the score screen. No on-foot gameplay in V1.
- **Landmark popups**: passing a landmark shows its name + one-line fact; narrator may comment.
- **Scoring**: distance, near-misses, style (swerves), tyres burst, goats spared.

## Narrator
- Authentic Jamaican voice, recorded lines (patois), triggered by game events.
- Examples: pothole burst — "Yuh tyre bust, brethren!"; speeding — commentary; goat near-miss; arriving in Ochi.
- Text captions accompany all voice lines (accessibility + sharing).
- V1 ships with a starter set (~30–50 lines); event→line mapping is data-driven so lines can be added without code changes.

## Multiplayer (V1: ambient)
- See other players driving the route in real time with name tags (optional flag badges).
- WebSocket position sync (10–15 Hz), client-side interpolation. No collisions between players in V1.
- Simple chat or horn/honk emote only. No accounts required to play; nickname prompt.

## Monetization: Two Ad Tiers (game stays free worldwide, no paywalls)
**Tier 1 — Billboards (self-serve):** Billboards and building-side ad surfaces placed along the route from day one, each with a unique ID. V1 ships placeholders (rotating Jamaican-flavored house ads / "Advertise here"). Phase 2: self-serve portal — a business clicks a billboard (or visits the site), uploads creative, pays, goes live after moderation. Requires backend: payments (Stripe), content review queue, scheduling, basic impression analytics (vehicles passing within view).

**Tier 2 — Sponsored Buildings (direct sales, premium):** Real businesses' actual locations modeled as branded voxel landmarks on the route. Anchor targets: KFC and Burger King Jamaica (KFC Jamaica's locations are widely reported among the highest-grossing in the world — verify and source claims before pitching), plus hotels and resorts along the Kingston→Ochi corridor. Pitch: their real store, in the game, where diaspora players drive past it daily. Sponsored buildings can include light interactions (drive-thru honk, narrator shout-out). Direct outreach with a pitch deck; deck research is a pre-launch task.

### Palisadoes leg scenery (owner description, 2026-06-10)
Leaving the airport: sea on both sides of the road — **Gun Boat Beach and calm harbour water on the LEFT**, **rough open sea on the RIGHT** — with Jamaica's mountainous terrain rising ahead, then the **Harbour View roundabout** into Windward Road.

## Landmarks (V1 candidates)
Norman Manley Airport, Palisadoes strip, **Gun Boat Beach**, Harbour View roundabout, Port Royal (signpost), National Heroes Park, Devon House, Emancipation Park, Half Way Tree clock tower, Bob Marley Museum (exterior), Flat Bridge / Bog Walk gorge, Faith's Pen cookshops, Fern Gully, Ocho Rios bay, Dunn's River Falls, KFC/Burger King locations on route (sponsorship targets — see Monetization Tier 2), Tastee and Juici Patties locations on route (iconic Jamaican patty shops — recognition landmarks and Tier 2 sponsorship targets), **Usain Bolt's Tracks & Records restaurant on Constant Spring Road** (prominent place — also a natural Tier 2 sponsorship target). Castleton Gardens moves to the future Junction-road route.

**High schools (owner decision, 2026-06-10): V1 places only schools on or visible from the route.** The full prominent-schools roster lands in V2 Kingston open city.

Owner's V1 school list (placements are owner's lived knowledge — authoritative):
- **Excelsior High** — opposite the National Stadium (on route)
- **St. Andrew High** and **Holy Childhood High** — in the Half Way Tree area (on route)
- **Calabar High (featured — founder's alma mater)** — Red Hills Road
- **Hydel High** — as you leave the city heading west (on route)
- **Jamaica College** — Old Hope Rd (include if the final Kingston leg passes it)
- **Downtown prominence signposts**: Kingston College, St. George's, Kingston Technical, Wolmer's Boys & Wolmer's Girls are not on the route but get highlighted as downtown landmarks because of their prominence (road signs / map callouts pointing downtown, narrator may name-check them)

## Recognition System (roads, communities, landmarks)
The core of the recognition pillar — three layers of place identification, all data-driven from `data/` JSON:

1. **Road callouts**: whenever the player turns onto a road, its name is shown (street-sign-style HUD popup). Examples: Mountain View Avenue, Old Hope Road, Windward Road. Every named road on the route gets this, not a curated subset.
2. **Community signs**: passing into a community/district shows its name (in-world sign + HUD). Examples: Wareika Hill, Half Way Tree, Linstead, Moneague. Full list per the communities research task below.
3. **Landmark popups**: prominent places show name + one-line fact as you pass. Examples: Devon House, Jamaica College, Tastee and Juici Patties shops, Bob Marley Museum.

The narrator can comment on any entry in all three layers (data-driven event→line mapping, same as other narrator triggers). This system serves the diaspora ("places I used to frequent") and doubles as a must-see guide for tourists.

**Communities research task:** compile the communities/districts along the full Airport→Kingston→Bog Walk→Fern Gully→Ochi route (owner knows many; fill gaps with research). Each community gets a name sign in-game; this is core to the recognition pillar.

## Tech Stack
- **Frontend**: Three.js + TypeScript, Vite build. Single-page, no framework needed (or minimal).
- **Assets**: MagicaVoxel / Blockbench → GLB. Shared low-poly palette (greens, zinc roofs, Jamaican color accents).
- **World pipeline**: route polyline + per-stretch road names extracted via OSRM routing over OSM (`scripts/fetch-route.mjs`, waypoint-pinned to the scenic road) → simplified → `data/route.json` → runtime road-ribbon generator. Overpass API still used for surroundings: buildings/vegetation scatter, landmark coordinates, community boundaries. Landmarks placed by lat/lon → world coords.
- **Multiplayer server**: Node.js + ws (or uWebSockets.js). Stateless rooms, position broadcast.
- **Audio**: Howler.js or native WebAudio; narrator lines as compressed audio sprites.
- **Hosting**: static frontend on Cloudflare Pages/Vercel; WS server on Fly.io/Railway. Optimize for low bandwidth (diaspora + Jamaica mobile data): target < 10 MB initial load, lazy-load route chunks.
- **Performance target**: 60 fps on a mid-range phone browser.

## Explicitly Out of Scope for V1
Accounts/login, player collisions, race mode, ad self-serve backend, full Kingston grid, interior spaces, mobile app wrappers.

## Open Questions

- Voice talent sourcing for the narrator.
- High school list and community names — owner to provide (lived knowledge beats map data).

## Vehicles (V1)
- **Starter: old Toyota Corolla "deportee" — souped up.** Visual + audio upgrade levels: exhaust, rims, engine work, and a sound system (trunk-rattling bass at higher levels). Upgrades earned through play in V1 (no real-money purchases).
- Monster truck exists only as the traffic-crush transformation, not a drivable roster vehicle.
- Later roster candidates: Probox route taxi, Hiace coaster bus (each with their own handling personality).
