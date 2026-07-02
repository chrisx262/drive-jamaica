import * as THREE from 'three';
import { initInput } from './input';
import { Car } from './car';
import { Road } from './road';
import type { RoadLike } from './road';
import { Recognition } from './recognition';
import { buildScenery } from './scenery';
import { buildTrees } from './trees';
import { Potholes } from './potholes';
import { initNarrator, narrate } from './narrator';
import { TestTrack } from './testtrack';
import { Debug } from './debug';
import { Dogs } from './dogs';
import { Goats } from './goats';
import { Traffic } from './traffic';
import { Score } from './score';
import { FaithsPen } from './faithspen';
import { Billboards } from './billboards';
import { CowHerder } from './cowherder';
import { MonsterTruck } from './monstertruck';
import { OffRoad } from './offroad';
import { initTouch } from './touch';
import { TyreShops } from './tyreshops';
import { Multiplayer } from './multiplayer';
import { UpgradeSystem } from './upgrades';

const app = document.getElementById('app')!;
const hud = document.getElementById('hud')!;
const frustrationWrap = document.getElementById('frustration-wrap') as HTMLDivElement;
const frustrationFill = document.getElementById('frustration-fill') as HTMLDivElement;
const frustrationLabel = document.getElementById('frustration-label') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 300, 2600);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 6000);

scene.add(new THREE.HemisphereLight(0xffffff, 0x4e8c3a, 0.9));
const sun = new THREE.DirectionalLight(0xfff4d6, 1.2);
sun.position.set(50, 120, 40);
scene.add(sun);

const params = new URLSearchParams(location.search);
const isTestTrack = params.has('testtrack');
const isDebug = isTestTrack || params.has('debug');

let road: RoadLike;
let recognition: Recognition | null = null;
let traffic: Traffic | null = null;
let score: Score | null = null;
let faithsPen: FaithsPen | null = null;
let offRoad: OffRoad | null = null;

if (isTestTrack) {
  const tt = new TestTrack();
  road = tt;
  scene.add(tt.object);
  // Test track supplies its own geometry; no route scenery zones apply.
} else {
  const r = new Road();
  road = r;
  scene.add(r.object);
  scene.add(buildScenery(r));
  scene.add(buildTrees(r));
  recognition = new Recognition(r);

  traffic = new Traffic(r);
  scene.add(traffic.object);

  score = new Score(r);

  faithsPen = new FaithsPen(r);
  scene.add(faithsPen.object);

  const billboards = new Billboards(r);
  scene.add(billboards.object);

  offRoad = new OffRoad(r);
  scene.add(offRoad.object);
}

const potholes = new Potholes(road);
scene.add(potholes.object);

const dogs = new Dogs(road);
scene.add(dogs.object);

const goats = new Goats(road);
scene.add(goats.object);

const cowHerder = new CowHerder(road);
scene.add(cowHerder.object);

const car = new Car();
const monsterTruck = new MonsterTruck(car);
// ?monster=1 pre-fills the meter so the transform can be tested immediately
if (params.has('monster')) monsterTruck.frustration = 1;

const tyreShops = new TyreShops(road);
scene.add(tyreShops.object);

const upgrades = new UpgradeSystem(car, scene);

// Spawn at the route start — or at ?jump=<road name match> for quick scenery
// review (e.g. /?jump=gorge, /?jump=milford, /?jump=faith).
// In test track mode jump is ignored and the car starts at the track beginning.
let startIndex = 0;
if (!isTestTrack) {
  const jump = params.get('jump');
  if (jump) {
    const seg = road.segments.find((s) => s.name.toLowerCase().includes(jump.toLowerCase()));
    if (seg) startIndex = seg.from;
  }
}

// Face along the route, in the LEFT lane.
const p0 = road.points[startIndex];
const dir = road.points[startIndex + 1].clone().sub(p0).normalize();
car.heading = Math.atan2(-dir.x, -dir.z);
car.object.position.copy(p0).addScaledVector(new THREE.Vector3(dir.z, 0, -dir.x), 2);
car.object.rotation.y = car.heading;
scene.add(car.object);

const input = initInput();
initNarrator();
initTouch(input);

// Ambient multiplayer: connect if VITE_WS_URL is set (or localhost:8080 in dev).
// Falls back to solo silently if the server is unreachable.
const wsUrl: string | undefined =
  (import.meta.env as Record<string, string | undefined>)['VITE_WS_URL'] ??
  (import.meta.env.DEV ? 'ws://localhost:8080' : undefined);
const multiplayer = new Multiplayer(scene, car, wsUrl);

let debug: Debug | null = null;
if (isDebug) {
  debug = new Debug(scene, car, road.points, potholes, isTestTrack);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

narrate('game.start');

// Dev-only handle for automated drive tests (stripped from production builds).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__dj = {
    car, road, potholes, dogs, goats, cowHerder, monsterTruck,
    tyreShops, score, faithsPen, offRoad, multiplayer, upgrades,
  };
}

const camOffset = new THREE.Vector3();
let last = performance.now();
// Track honk key for edge-triggered (press, not hold) detection
let prevHonk = false;

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  const honkJustPressed = input.honk && !prevHonk;
  prevHonk = input.honk;

  car.update(dt, input);
  potholes.update(car);
  dogs.update(car, dt);
  goats.update(car, dt);
  cowHerder.update(car, dt);
  monsterTruck.update(dt, honkJustPressed);
  traffic?.update(dt, car);
  score?.update(car, dt);
  faithsPen?.update(car, dt);
  tyreShops.update(car);
  upgrades.update(dt);
  multiplayer.update(dt, camera);

  const shake = offRoad?.update(car, dt) ?? 0;

  recognition?.update(car.position);
  debug?.update(dt);

  // Chase camera: behind and above the car, smoothed.
  // Scale offset during monster truck mode; add off-road shake.
  const scaleZ = car.object.scale.z;
  camOffset.set(Math.sin(car.heading) * 9 * scaleZ, 5 * scaleZ, Math.cos(car.heading) * 9 * scaleZ);
  camera.position.lerp(car.position.clone().add(camOffset), 1 - Math.exp(-5 * dt));
  camera.position.y += Math.sin(now / 40) * shake;
  camera.lookAt(car.position.x, car.position.y + 1.2 * scaleZ, car.position.z);

  // Main HUD: speed + tyre status + truck badge + goat penalty
  const truckBadge = monsterTruck.active ? '  \u{1F69B} BIG TRUCK!' : '';
  const goatPenalty = goats.penaltyCount > 0 ? `  \u{1F410} -${goats.penaltyCount}` : '';
  hud.textContent = `${Math.round(car.speedKmh)} km/h${car.tyreBurst ? '  \u{1F6DE} TYRE BUST!' : ''}${truckBadge}${goatPenalty}`;

  // Frustration meter HUD
  const pct = monsterTruck.hudPct;
  const visible = pct > 1 || monsterTruck.active;
  frustrationWrap.style.opacity = visible ? '1' : '0';
  frustrationFill.style.width = `${pct}%`;
  const isReady = !monsterTruck.active && monsterTruck.frustration >= 1;
  const isTruck = monsterTruck.active;
  frustrationWrap.classList.toggle('ready', isReady);
  frustrationWrap.classList.toggle('truck-active', isTruck);
  if (isTruck) {
    frustrationLabel.textContent = '\u{1F69B} BIG TRUCK TING!';
  } else if (isReady) {
    frustrationLabel.textContent = '\u{1F620} PRESS H';
  } else {
    frustrationLabel.textContent = '\u{1F620} FRUSTRATION';
  }

  renderer.render(scene, camera);
});
