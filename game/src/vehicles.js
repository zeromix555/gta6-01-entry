// SOLMAR HEAT v2
// Vehicles — car mesh factory, parked cars, and traffic AI that drives the
// road grid, slows for the car ahead, and turns at intersections.
import { CAR, PAINTS, BLOCK, ROAD_HALF, CITY_HALF } from './config.js';
import { pick, range } from './random.js';
import { resolveCollisions } from './city.js';

export function makeCarMesh(color, isPolice, isSports) {
  const group = new THREE.Group();
  const paint = new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x666666 });
  const dark = new THREE.MeshPhongMaterial({ color: 0x1a2027, shininess: 40 });
  const bodyH = isSports ? 0.55 : 0.75;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, bodyH, isSports ? 4.6 : 4.2), paint);
  body.position.y = 0.55; body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.0), dark);
  cabin.position.set(0, 0.55 + bodyH / 2 + 0.28, isSports ? -0.2 : 0.1);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    group.add(wheel); wheels.push(wheel);
  }
  let lightBar = null;
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    bar.position.set(0, 1.35, 0.1);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.42),
      new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000 }));
    red.position.set(-0.35, 1.5, 0.1); group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0000ff }));
    blue.position.set(0.35, 1.5, 0.1); group.add(blue);
    lightBar = { red, blue };
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 4.22),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    stripe.position.y = 0.55; group.add(stripe);
  }
  return { group, wheels, lightBar };
}

export function createCar(id, x, z, heading, color, opts = {}) {
  const mesh = makeCarMesh(color, !!opts.police, !!opts.sports);
  mesh.group.position.set(x, 0, z);
  mesh.group.rotation.y = heading;
  return {
    id, x, z, heading,
    speed: 0,
    color,
    police: !!opts.police,
    sports: !!opts.sports,
    parked: !!opts.parked,
    mission: opts.mission || null, // 'homeCar' | 'comet' | null
    mesh: mesh.group,
    wheels: mesh.wheels,
    lightBar: mesh.lightBar,
    health: CAR.healthMax,
    target: null, // traffic waypoint {x,z}
    waitTimer: 0,
    smoke: 0,
  };
}

// --- Traffic AI: pick a random intersection, drive there along roads. ---
export function trafficStep(car, dt, random, roadLines, allCars, colliders) {
  if (car.parked) return;
  if (!car.target || Math.hypot(car.target.x - car.x, car.target.z - car.z) < 6) {
    const line = pick(random, roadLines);
    const other = pick(random, roadLines);
    car.target = random() < 0.5 ? { x: line, z: other } : { x: other, z: line };
    // Snap target onto a road: drive along one axis at a time.
    car.leg = Math.abs(car.target.x - car.x) > Math.abs(car.target.z - car.z) ? 'x' : 'z';
  }
  // Slow down if another car is close ahead.
  let targetSpeed = 11;
  for (const other of allCars) {
    if (other === car || other.parked) continue;
    const dx = other.x - car.x; const dz = other.z - car.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 9) {
      const ahead = Math.cos(car.heading) * dx + Math.sin(car.heading) * dz;
      if (ahead > 0 && dist < 9) targetSpeed = 0;
    }
  }
  const dx = car.target.x - car.x;
  const dz = car.target.z - car.z;
  let desired;
  if (car.leg === 'x') desired = Math.atan2(dx, dz); // heading: 0 = +z? see note below
  else desired = Math.atan2(dx, dz);
  // Heading convention: forward = (sin(heading), cos(heading)) in (x, z).
  desired = Math.atan2(dx, dz);
  let diff = desired - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-0.6, Math.min(0.6, diff * 2));
  car.heading += steer * 2.2 * dt * Math.min(1, Math.abs(car.speed) / 4 + 0.3);
  car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.2);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  const fixed = resolveCollisions(car.x, car.z, 1.6, colliders);
  car.x = fixed.x; car.z = fixed.z;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const spin = car.speed * dt * 2.6;
  for (const w of car.wheels) w.rotation.x += spin;
}

export function spawnTraffic(random, roadLines, colliders) {
  const cars = [];
  for (let i = 0; i < 14; i += 1) {
    const line = pick(random, roadLines);
    const along = range(random, -CITY_HALF, CITY_HALF);
    const horizontal = random() < 0.5;
    const x = horizontal ? along : line + (random() < 0.5 ? 3.5 : -3.5);
    const z = horizontal ? line + (random() < 0.5 ? 3.5 : -3.5) : along;
    const heading = horizontal ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI);
    const car = createCar(`traffic-${i}`, x, z, heading, pick(random, PAINTS));
    car.speed = range(random, 6, 11);
    cars.push(car);
  }
  return cars;
}

export function spawnParked(random) {
  const cars = [];
  const spots = [
    { x: -49.5, z: -20, heading: 0, mission: 'homeCar', color: 0x2c6e4f, label: 'sedan' },
    { x: 122, z: -42, heading: 0, mission: 'comet', color: 0xc0392b, sports: true, label: 'Comet GT' },
    { x: -116, z: -50, heading: Math.PI / 2, color: 0xe67e22 },
    { x: 58, z: 66, heading: Math.PI, color: 0x2980b9 },
    { x: -116, z: 182, heading: -Math.PI / 2, color: 0x8e44ad },
    { x: 174, z: 166, heading: Math.PI / 2, color: 0xecf0f1 },
    { x: 0, z: -174, heading: 0, color: 0x27ae60 },
    { x: -174, z: -58, heading: Math.PI, color: 0xd35400 },
  ];
  for (let i = 0; i < spots.length; i += 1) {
    const s = spots[i];
    const car = createCar(`parked-${i}`, s.x, s.z, s.heading, s.color, { parked: true, mission: s.mission || null, sports: !!s.sports });
    cars.push(car);
  }
  return cars;
}
