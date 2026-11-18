// SOLMAR HEAT v3
// Renderer — three.js setup, third-person follow camera, objective beacon,
// and lightweight particle bursts (muzzle flash, impacts, pickup sparkles).
import { CITY_HALF } from './config.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
  camera.position.set(0, 12, 18);

  // Objective beacon: a tall golden light pillar + floating diamond.
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffd700, transparent: true, opacity: 0.35, depthWrite: false,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 12, 1, true), beaconMat);
  beacon.position.y = 30;
  beacon.visible = false;
  scene.add(beacon);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color: 0xffd700 }),
  );
  diamond.position.y = 8;
  diamond.visible = false;
  scene.add(diamond);

  // Particle pool (one Points cloud, recycled).
  const MAXP = 400;
  const positions = new Float32Array(MAXP * 3);
  const colors = new Float32Array(MAXP * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.95 }));
  points.frustumCulled = false;
  scene.add(points);
  const parts = [];
  for (let i = 0; i < MAXP; i += 1) parts.push({ life: 0, vx: 0, vy: 0, vz: 0, i });
  let nextPart = 0;

  function burst(x, y, z, color, count, speed) {
    for (let n = 0; n < count; n += 1) {
      const p = parts[nextPart];
      nextPart = (nextPart + 1) % MAXP;
      p.life = 0.5 + Math.random() * 0.4;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * speed;
      p.vx = Math.cos(a) * speed * (0.4 + Math.random() * 0.6);
      p.vz = Math.sin(a) * speed * (0.4 + Math.random() * 0.6);
      p.vy = up;
      positions[p.i * 3] = x; positions[p.i * 3 + 1] = y; positions[p.i * 3 + 2] = z;
      const c = new THREE.Color(color);
      colors[p.i * 3] = c.r; colors[p.i * 3 + 1] = c.g; colors[p.i * 3 + 2] = c.b;
    }
  }

  function updateParticles(dt) {
    for (const p of parts) {
      if (p.life <= 0) { positions[p.i * 3 + 1] = -100; continue; }
      p.life -= dt;
      positions[p.i * 3] += p.vx * dt;
      positions[p.i * 3 + 1] += p.vy * dt;
      positions[p.i * 3 + 2] += p.vz * dt;
      p.vy -= 6 * dt;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  const camState = { yaw: 0, pitch: 0.32, dist: 10, x: 0, y: 8, z: 14 };

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // Third-person camera: behind the player/car, smoothed, never under the ground.
  function updateCamera(dt, target, yaw, pitch, driving) {
    const dist = driving ? 11 : 8.5;
    const height = driving ? 4.0 : 3.0;
    const tx = target.x - Math.sin(yaw) * dist * Math.cos(pitch);
    const tz = target.z - Math.cos(yaw) * dist * Math.cos(pitch);
    const ty = height + Math.sin(pitch) * dist * 0.7;
    const k = 1 - Math.pow(0.001, dt);
    camState.x += (tx - camState.x) * k;
    camState.y += (ty - camState.y) * k;
    camState.z += (tz - camState.z) * k;
    camState.y = Math.max(1.6, camState.y);
    camera.position.set(camState.x, camState.y, camState.z);
    camera.lookAt(target.x, target.y + 1.4, target.z);
  }

  return {
    renderer, scene, camera,
    resize, updateCamera, updateParticles, burst,
    setBeacon(x, z, visible) {
      beacon.visible = visible; diamond.visible = visible;
      if (visible) {
        beacon.position.x = x; beacon.position.z = z;
        diamond.position.x = x; diamond.position.z = z;
        diamond.position.y = 7 + Math.sin(performance.now() / 300) * 0.8;
        diamond.rotation.y += 0.05;
      }
    },
  };
}

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';
