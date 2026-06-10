import * as THREE from 'three';
import { initInput } from './input';
import { Car } from './car';
import { Road } from './road';
import { Recognition } from './recognition';
import { buildScenery } from './scenery';
import { Potholes } from './potholes';
import { initNarrator, narrate } from './narrator';

const app = document.getElementById('app')!;
const hud = document.getElementById('hud')!;

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

const road = new Road();
scene.add(road.object);
scene.add(buildScenery(road));
const potholes = new Potholes(road);
scene.add(potholes.object);

const car = new Car();
// Spawn at the route start, facing along it, in the LEFT lane.
const p0 = road.points[0];
const dir = road.points[1].clone().sub(p0).normalize();
car.heading = Math.atan2(-dir.x, -dir.z);
car.object.position.copy(p0).addScaledVector(new THREE.Vector3(dir.z, 0, -dir.x), 2);
car.object.rotation.y = car.heading;
scene.add(car.object);

const input = initInput();
initNarrator();
const recognition = new Recognition(road);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

narrate('game.start');

// Dev-only handle for automated drive tests (stripped from production builds).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__dj = { car, road, potholes };
}

const camOffset = new THREE.Vector3();
let last = performance.now();

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  car.update(dt, input);
  potholes.update(car);
  recognition.update(car.position);

  // Chase camera: behind and above the car, smoothed.
  camOffset.set(Math.sin(car.heading) * 9, 5, Math.cos(car.heading) * 9);
  camera.position.lerp(car.position.clone().add(camOffset), 1 - Math.exp(-5 * dt));
  camera.lookAt(car.position.x, car.position.y + 1.2, car.position.z);

  hud.textContent = `${Math.round(car.speedKmh)} km/h${car.tyreBurst ? '  \u{1F6DE} TYRE BUST!' : ''}`;
  renderer.render(scene, camera);
});
