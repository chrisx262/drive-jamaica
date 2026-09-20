import * as THREE from 'three';
import { initInput } from './input';
import { Car } from './car';
import { Road } from './road';
import type { RoadLike } from './road';
import { Recognition } from './recognition';
import { buildScenery } from './scenery';
import { buildTrees } from './trees';
import { Potholes, HIT_RADIUS } from './potholes';
import { Dogs } from './dogs';
import { Goats } from './goats';
import { Scoring } from './scoring';
import { initNarrator, narrate } from './narrator';
import { TestTrack } from './testtrack';
import { Debug } from './debug';

const app = document.getElementById('app')!;
const hud = document.getElementById('hud')!;
const scoreEl = document.getElementById('score')!;

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

if (isTestTrack) {
  const tt = new TestTrack();
  road = tt;
  scene.add(tt.object);
} else {
  const r = new Road();
  road = r;
  scene.add(r.object);
  scene.add(buildScenery(r));
  scene.add(buildTrees(r));
  recognition = new Recognition(r);
}

const potholes = new Potholes(road);
scene.add(potholes.object);

const dogs = new Dogs(road);
scene.add(dogs.object);

const goats = new Goats(road);
scene.add(goats.object);

const scoring = new Scoring();

const car = new Car();

// Spawn at the route start — or at ?jump=<road name match> for quick scenery review.
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

// Dev-only handle for automated drive tests.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__dj = { car, road, potholes, dogs, goats, scoring };
}

// Speed commentary.
const SPEED_HIGH_KMH = 90;
const SPEED_HIGH_COOLDOWN = 15; // seconds between events
let speedHighCooldown = 0;

// Tyre-burst edge detection for scoring.
let prevTyreBurst = false;

// Swerve style scoring.
const SWERVE_STEER_THRESHOLD = 0.65;
const SWERVE_SPEED_MIN = 10; // m/s
const SWERVE_COOLDOWN = 3;   // seconds between recorded swerves
let swerveCooldown = 0;

// Pothole near-miss detection.
const NEAR_MISS_INNER_SQ = HIT_RADIUS * HIT_RADIUS;
const NEAR_MISS_OUTER = 4.0;
const NEAR_MISS_OUTER_SQ = NEAR_MISS_OUTER * NEAR_MISS_OUTER;
const NEAR_MISS_SPEED_MIN = 13; // m/s
const NEAR_MISS_COOLDOWN = 2;  // seconds
let nearMissCooldown = 0;

// Previous goat count for leading-edge detection.
let prevGoatsHit = 0;
// Previous dog chase count.
let prevDogChases = 0;

const camOffset = new THREE.Vector3();
let last = performance.now();

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  car.update(dt, input);
  potholes.update(car);
  dogs.update(car, dt);
  goats.update(car, dt);
  recognition?.update(car.position);
  debug?.update(dt);

  // Distance scoring — only while moving forward.
  if (car.speed > 0) scoring.addDistance(car.speed * dt);

  // Tyre burst — record each distinct burst.
  if (car.tyreBurst && !prevTyreBurst) scoring.recordTyreBurst();
  prevTyreBurst = car.tyreBurst;

  // Goat hit scoring.
  if (goats.goatsHit > prevGoatsHit) {
    for (let i = prevGoatsHit; i < goats.goatsHit; i++) scoring.recordGoatHit();
    prevGoatsHit = goats.goatsHit;
  }

  // Dog chase scoring.
  if (dogs.chaseCount > prevDogChases) {
    for (let i = prevDogChases; i < dogs.chaseCount; i++) scoring.recordDogChase();
    prevDogChases = dogs.chaseCount;
  }

  // Swerve style scoring.
  swerveCooldown = Math.max(0, swerveCooldown - dt);
  if (swerveCooldown === 0 && Math.abs(car.steerPos) >= SWERVE_STEER_THRESHOLD && Math.abs(car.speed) >= SWERVE_SPEED_MIN) {
    scoring.recordSwerve();
    swerveCooldown = SWERVE_COOLDOWN;
  }

  // Pothole near-miss scoring.
  nearMissCooldown = Math.max(0, nearMissCooldown - dt);
  if (nearMissCooldown === 0 && !car.tyreBurst && Math.abs(car.speed) >= NEAR_MISS_SPEED_MIN) {
    for (const p of potholes.positions) {
      const dsq = car.position.distanceToSquared(p);
      if (dsq < NEAR_MISS_OUTER_SQ && dsq > NEAR_MISS_INNER_SQ) {
        scoring.recordNearMiss();
        narrate('pothole.nearmiss');
        nearMissCooldown = NEAR_MISS_COOLDOWN;
        break;
      }
    }
  }

  // Speed commentary.
  speedHighCooldown = Math.max(0, speedHighCooldown - dt);
  if (car.speedKmh >= SPEED_HIGH_KMH && speedHighCooldown === 0) {
    speedHighCooldown = SPEED_HIGH_COOLDOWN;
    narrate('speed.high');
  }

  // Chase camera: behind and above the car, smoothed.
  camOffset.set(Math.sin(car.heading) * 9, 5, Math.cos(car.heading) * 9);
  camera.position.lerp(car.position.clone().add(camOffset), 1 - Math.exp(-5 * dt));
  camera.lookAt(car.position.x, car.position.y + 1.2, car.position.z);

  const goatPenalty = goats.goatsHit > 0 ? `  \u{1F410}×${goats.goatsHit}` : '';
  hud.textContent = `${Math.round(car.speedKmh)} km/h${car.tyreBurst ? '  \u{1F6DE} TYRE BUST!' : ''}${goatPenalty}`;

  const s = scoring.stats;
  scoreEl.textContent = `Score: ${scoring.score.toLocaleString()}  |  ${s.distKm} km  |  \u{1F6DE}${s.tyreBursts}  \u{1F993}${s.goatsHit}`;

  renderer.render(scene, camera);
});
