// SOLMAR HEAT — the renderer: a procedural Three.js city.
//
// No external assets: every building, road, car, person and particle is a
// box, cylinder or plane built in code. The renderer owns the THREE scene
// and camera; it reads the world each frame and moves meshes to match. Mesh
// creation is lazy and keyed by the game object itself (a Map), so cars the
// police spawn mid-chase get a mesh the first frame they are seen, and
// nothing is ever built twice.
//
// Camera: third-person chase. It trails behind the player's heading (or the
// car's), eases toward its target instead of snapping, and lets a mouse
// drag orbit it. The gold beacon — a pulsing ring, a beam of light and a
// floating diamond — always marks the mission objective.

import { WORLD, COLORS, HUD, CAMERA } from './config.js';
import { clamp } from './random.js';
import { playerPos } from './world.js';

/** Build the renderer, scene, lights and static city geometry. */
export function createRenderer(canvas) {
  const THREE = window.THREE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(canvas.clientWidth || 1280, canvas.clientHeight || 800, false);
  if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.fog, 120, 320);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x3a4a3a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.1);
  sun.position.set(60, 100, 30);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(62, 1280 / 800, 0.1, 600);
  camera.position.set(0, 12, 18);

  const ctx = {
    THREE,
    renderer,
    scene,
    camera,
    meshes: new Map(), // game object -> THREE.Group
    carMeshes: new Map(), // car object -> THREE.Group
    particles: [],
    beacon: null,
    built: false,
    camPos: new THREE.Vector3(0, 12, 18),
    camLook: new THREE.Vector3(0, 0, 0),
  };
  return ctx;
}

/** Build the static city (ground, roads, buildings, trees) once. */
export function buildCity(ctx, world) {
  const { THREE, scene } = ctx;
  if (ctx.built) return;
  ctx.built = true;

  // Ground: one big lawn-green plane under everything.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.groundSize, WORLD.groundSize),
    new THREE.MeshLambertMaterial({ color: COLORS.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);

  // Roads: dark strips along every avenue and street, with a pale centre
  // line so the grid reads at a glance from the chase camera.
  const roadMat = new THREE.MeshLambertMaterial({ color: COLORS.road });
  const lineMat = new THREE.MeshBasicMaterial({ color: COLORS.roadLine });
  const sideMat = new THREE.MeshLambertMaterial({ color: COLORS.sidewalk });
  for (const line of world.city.roadLines) {
    const half = (line === 0 ? WORLD.avenueWidth : WORLD.roadWidth) / 2;
    const width = half * 2;
    for (const vertical of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? width : 220, vertical ? 220 : width), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(vertical ? line : 0, 0, vertical ? 0 : line);
      scene.add(road);
      // Sidewalk border on both sides of the road.
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? 3 : 220, vertical ? 220 : 3), sideMat);
        walk.rotation.x = -Math.PI / 2;
        walk.position.set(
          vertical ? line + side * (half + 1.5) : 0,
          0.01,
          vertical ? 0 : line + side * (half + 1.5),
        );
        scene.add(walk);
      }
      // Dashed centre line: a row of short pale boxes.
      for (let t = -100; t <= 100; t += 8) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(vertical ? 0.4 : 3, 0.05, vertical ? 3 : 0.4), lineMat);
        dash.position.set(vertical ? line : t, 0.02, vertical ? t : line);
        scene.add(dash);
      }
    }
  }

  // Buildings: boxes with a shared window texture, tinted per building.
  const windowTex = makeWindowTexture(ctx);
  for (const b of world.city.buildings) {
    const mat = new THREE.MeshLambertMaterial({ color: b.color, map: windowTex });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
    mesh.position.set(b.x, b.h / 2, b.z);
    scene.add(mesh);
    // A flat roof cap in a darker shade so towers read as finished.
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(b.w + 0.4, 0.4, b.d + 0.4),
      new THREE.MeshLambertMaterial({ color: 0x2a2d33 }),
    );
    cap.position.set(b.x, b.h + 0.2, b.z);
    scene.add(cap);
  }

  // Trees: a trunk cylinder and two stacked green cones.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3a22 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e6b34 });
  for (const tree of world.city.trees) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 1.4, 6), trunkMat);
    trunk.position.y = 0.7;
    group.add(trunk);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.3, tree.h, 7), leafMat);
    leaves.position.y = 1.4 + tree.h / 2;
    group.add(leaves);
    group.position.set(tree.x, 0, tree.z);
    scene.add(group);
  }

  // Lamp posts at every intersection: a pole and a warm glowing head.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const lamp of world.city.lamps) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5, 6), poleMat);
    pole.position.set(lamp.x, 2.5, lamp.z);
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), lampMat);
    head.position.set(lamp.x, 5.1, lamp.z);
    scene.add(head);
  }

  // The gold beacon over the mission objective.
  ctx.beacon = makeBeacon(ctx);
  scene.add(ctx.beacon.group);
}

/** One canvas texture of lit windows, shared by every building. */
function makeWindowTexture(ctx) {
  const { THREE } = ctx;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#ffd98a';
  for (let y = 8; y < 120; y += 16) {
    for (let x = 8; x < 56; x += 16) {
      // About two thirds of the windows are lit: a cheap evening city.
      if ((x * 7 + y * 13) % 3 !== 0) g.fillRect(x, y, 9, 11);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

/** The mission beacon: a gold ring, a light beam and a floating diamond. */
function makeBeacon(ctx) {
  const { THREE } = ctx;
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3, 32),
    new THREE.MeshBasicMaterial({ color: COLORS.gold, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  group.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 1.4, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: COLORS.gold, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 13;
  group.add(beam);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color: COLORS.gold }),
  );
  gem.position.y = 7;
  group.add(gem);
  return { group, ring, gem };
}

/** A car mesh: body, cabin, four wheels, headlights and taillights. */
export function makeCarMesh(ctx, car) {
  const { THREE } = ctx;
  const group = new THREE.Group();
  const low = car.kind === 'sport';
  const bodyMat = new THREE.MeshLambertMaterial({ color: car.color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, low ? 0.55 : 0.75, 4.4), bodyMat);
  body.position.y = low ? 0.55 : 0.65;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.6, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x18242e }),
  );
  cabin.position.set(0, (low ? 0.55 : 0.75) + 0.55, -0.2);
  group.add(cabin);
  if (low) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.4), bodyMat);
    spoiler.position.set(0, 1.05, 2.0);
    group.add(spoiler);
  }
  if (car.kind === 'cop') {
    // The light bar: red on one side, blue on the other. They flash in
    // alternation (see renderWorld), so a chasing cruiser strobes.
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 0.5), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    bar.position.set(0, 1.35, -0.2);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.24, 0.52), new THREE.MeshBasicMaterial({ color: COLORS.copLightRed }));
    red.position.set(-0.35, 1.35, -0.2);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.24, 0.52), new THREE.MeshBasicMaterial({ color: COLORS.copLightBlue }));
    blue.position.set(0.35, 1.35, -0.2);
    group.add(blue);
    group.userData.lights = { red, blue };
  }
  // Headlights (front is -Z in car space: forward is (sin h, cos h), and
  // the mesh faces -Z when heading is 0, so lights sit at -Z).
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const side of [-0.7, 0.7]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), lightMat);
    lamp.position.set(side, 0.6, -2.22);
    group.add(lamp);
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.2, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xff3020 }),
    );
    tail.position.set(side, 0.6, 2.22);
    group.add(tail);
  }
  // Wheels: cylinders rotated to spin around the X axis.
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  car.wheels = [];
  for (const [wx, wz] of [[-1.05, -1.45], [1.05, -1.45], [-1.05, 1.45], [1.05, 1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    group.add(wheel);
    car.wheels.push(wheel);
  }
  return group;
}

/** The player's on-foot mesh: a walking figure with a swinging stride. */
export function makePlayerMesh(ctx) {
  const { THREE } = ctx;
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: COLORS.playerJacket });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a077 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a3242 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), jacket);
  torso.position.y = 1.15;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.85;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  cap.position.y = 2.02;
  group.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.3), pants);
  legL.position.set(-0.18, 0.4, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.3), pants);
  legR.position.set(0.18, 0.4, 0);
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), jacket);
  armL.position.set(-0.46, 1.15, 0);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), jacket);
  armR.position.set(0.46, 1.15, 0);
  group.add(armR);
  group.userData = { legL, legR, armL, armR };
  return group;
}

/** A pedestrian mesh: same figure, different jacket, smaller presence. */
export function makePedMesh(ctx, ped) {
  const group = makePlayerMesh(ctx);
  group.children[0].material = new (ctx.THREE.MeshLambertMaterial)({ color: ped.color });
  group.scale.setScalar(0.92);
  return group;
}

/** A bank guard mesh: dark uniform, red beret, visibly armed. */
export function makeGuardMesh(ctx) {
  const group = makePlayerMesh(ctx);
  group.children[0].material = new (ctx.THREE.MeshLambertMaterial)({ color: 0x1e2a1e });
  const beret = new (ctx.THREE.Mesh)(new (ctx.THREE.CylinderGeometry)(0.3, 0.3, 0.12, 10), new (ctx.THREE.MeshLambertMaterial)({ color: 0x8a1a1a }));
  beret.position.y = 2.02;
  group.add(beret);
  return group;
}

/** A cash drop: a small spinning green-gold envelope. */
export function makeCashMesh(ctx) {
  const { THREE } = ctx;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.12, 0.5),
    new THREE.MeshLambertMaterial({ color: COLORS.cash, emissive: 0x0a3a1a }),
  );
  mesh.position.y = 0.5;
  return mesh;
}

/** Move every mesh to match the world, then render one frame. */
export function renderWorld(ctx, world) {
  buildCity(ctx, world);
  const { THREE, scene } = ctx;

  // The player (hidden while driving — you are the car now).
  if (!world.player.mesh) {
    world.player.mesh = makePlayerMesh(ctx);
    scene.add(world.player.mesh);
  }
  const pm = world.player.mesh;
  pm.visible = !world.player.inCar;
  pm.position.set(world.player.x, 0, world.player.z);
  pm.rotation.y = world.player.heading + Math.PI; // mesh faces -Z at rest
  const swing = Math.sin(world.player.walkPhase) * 0.45;
  pm.userData.legL.rotation.x = swing;
  pm.userData.legR.rotation.x = -swing;
  pm.userData.armL.rotation.x = -swing * 0.8;
  pm.userData.armR.rotation.x = swing * 0.8;

  // Every car in the world, keyed by the car object.
  const allCars = [world.homeCar, world.sportsCar, ...world.traffic, ...world.wanted.cops];
  for (const car of allCars) {
    if (!car) continue;
    let mesh = ctx.carMeshes.get(car);
    if (!mesh) {
      mesh = makeCarMesh(ctx, car);
      ctx.carMeshes.set(car, mesh);
      scene.add(mesh);
    }
    mesh.position.set(car.x, 0, car.z);
    mesh.rotation.y = car.heading + Math.PI;
    // Police light bars strobe red/blue in alternation, twice a second.
    if (car.kind === 'cop' && mesh.userData.lights) {
      const redOn = Math.floor(world.time * 4) % 2 === 0;
      mesh.userData.lights.red.visible = redOn;
      mesh.userData.lights.blue.visible = !redOn;
    }
    if (car.wheels) {
      for (const wheel of car.wheels) wheel.rotation.x = car.wheelSpin || 0;
    }
  }

  // Pedestrians, lying down when they are down.
  for (const ped of world.pedestrians) {
    let mesh = ctx.meshes.get(ped);
    if (!mesh) {
      mesh = makePedMesh(ctx, ped);
      ctx.meshes.set(ped, mesh);
      scene.add(mesh);
    }
    mesh.position.set(ped.x, 0, ped.z);
    if (ped.state === 'down') {
      mesh.rotation.set(Math.PI / 2, 0, ped.heading);
      mesh.position.y = 0.3;
    } else {
      mesh.rotation.set(0, ped.heading + Math.PI, 0);
      mesh.position.y = 0;
      const swing = Math.sin(ped.stepPhase) * 0.4;
      mesh.userData.legL.rotation.x = swing;
      mesh.userData.legR.rotation.x = -swing;
    }
  }

  // Bank guards (down ones lie flat like the pedestrians).
  for (const guard of world.guards) {
    let mesh = ctx.meshes.get(guard);
    if (!mesh) {
      mesh = makeGuardMesh(ctx);
      ctx.meshes.set(guard, mesh);
      scene.add(mesh);
    }
    mesh.position.set(guard.x, 0, guard.z);
    if (guard.health <= 0) {
      mesh.rotation.set(Math.PI / 2, 0, guard.heading);
      mesh.position.y = 0.3;
    } else {
      mesh.rotation.set(0, guard.heading + Math.PI, 0);
      mesh.position.y = 0;
    }
  }

  // Cash drops spin slowly until taken.
  for (const drop of world.cashDrops) {
    if (drop.taken) {
      if (drop.mesh) drop.mesh.visible = false;
      continue;
    }
    if (!drop.mesh) {
      drop.mesh = makeCashMesh(ctx);
      scene.add(drop.mesh);
    }
    drop.mesh.visible = true;
    drop.mesh.position.set(drop.x, 0.5 + Math.sin(world.time * 2 + drop.spin) * 0.15, drop.z);
    drop.mesh.rotation.y = world.time * 1.5 + drop.spin;
  }

  // The beacon follows the current objective and pulses.
  if (ctx.beacon) {
    const obj = world.objective;
    const pulse = 1 + Math.sin(world.time * 3) * 0.12;
    ctx.beacon.group.position.set(obj.x, 0, obj.z);
    ctx.beacon.ring.scale.setScalar(pulse);
    ctx.beacon.gem.position.y = 7 + Math.sin(world.time * 2) * 0.6;
    ctx.beacon.gem.rotation.y = world.time;
    ctx.beacon.group.visible = world.missions.index < 3;
  }

  updateParticles(ctx, world);
  updateCamera(ctx, world);
  ctx.renderer.render(scene, ctx.camera);
}

/** Chase camera: behind the heading, eased, with a mouse-orbit offset. */
export function updateCamera(ctx, world) {
  const p = world.player;
  const pos = playerPos(world);
  const inCar = p.inCar;
  // The camera yaw eases toward the heading; the mouse drags it away and
  // it drifts back over a couple of seconds (see main.js input handling).
  const yaw = p.camYaw;
  const dist = inCar ? CAMERA.chaseDistCar : CAMERA.chaseDistFoot;
  const height = inCar ? CAMERA.chaseHeightCar : CAMERA.chaseHeightFoot;
  const tx = pos.x - Math.sin(yaw) * dist;
  const tz = pos.z - Math.cos(yaw) * dist;
  const k = 1 - Math.pow(0.0001, 1 / 60); // ~frame-rate independent ease
  ctx.camPos.x += (tx - ctx.camPos.x) * k;
  ctx.camPos.y += (height - ctx.camPos.y) * k;
  ctx.camPos.z += (tz - ctx.camPos.z) * k;
  ctx.camera.position.copy(ctx.camPos);
  const lx = pos.x + Math.sin(yaw) * CAMERA.lookAhead;
  const lz = pos.z + Math.cos(yaw) * CAMERA.lookAhead;
  ctx.camLook.x += (lx - ctx.camLook.x) * k;
  ctx.camLook.y += (1.6 - ctx.camLook.y) * k;
  ctx.camLook.z += (lz - ctx.camLook.z) * k;
  ctx.camera.lookAt(ctx.camLook);
}

/**
 * Snap the camera straight to its target with no easing. Staged shots call
 * this once after the autopilot: the screenshot is taken a few frames later,
 * and an easing camera would still be mid-flight and misframe the shot.
 */
export function snapCamera(ctx, world) {
  const p = world.player;
  const pos = playerPos(world);
  const inCar = p.inCar;
  const yaw = p.camYaw;
  const dist = inCar ? CAMERA.chaseDistCar : CAMERA.chaseDistFoot;
  const height = inCar ? CAMERA.chaseHeightCar : CAMERA.chaseHeightFoot;
  ctx.camPos.set(pos.x - Math.sin(yaw) * dist, height, pos.z - Math.cos(yaw) * dist);
  ctx.camLook.set(pos.x + Math.sin(yaw) * CAMERA.lookAhead, 1.6, pos.z + Math.cos(yaw) * CAMERA.lookAhead);
  ctx.camera.position.copy(ctx.camPos);
  ctx.camera.lookAt(ctx.camLook);
}

/** Spawn a burst of small glowing particles at a world position. */
export function spawnParticles(ctx, x, y, z, color, count, speed) {
  const { THREE, scene } = ctx;
  for (let i = 0; i < count; i++) {
    if (ctx.particles.length > 60) break;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.16, 0.16),
      new THREE.MeshBasicMaterial({ color }),
    );
    mesh.position.set(x, y, z);
    scene.add(mesh);
    ctx.particles.push({
      mesh,
      vx: (Math.random() - 0.5) * speed,
      vy: Math.random() * speed * 0.7,
      vz: (Math.random() - 0.5) * speed,
      life: 0.6 + Math.random() * 0.4,
    });
  }
}

/** Advance particles: rise, fade, and remove the dead ones. */
function updateParticles(ctx, world) {
  const dt = 1 / 60;
  for (let i = ctx.particles.length - 1; i >= 0; i--) {
    const pt = ctx.particles[i];
    pt.life -= dt;
    if (pt.life <= 0) {
      ctx.scene.remove(pt.mesh);
      pt.mesh.geometry.dispose();
      pt.mesh.material.dispose();
      ctx.particles.splice(i, 1);
      continue;
    }
    pt.mesh.position.x += pt.vx * dt;
    pt.mesh.position.y += pt.vy * dt;
    pt.mesh.position.z += pt.vz * dt;
    pt.vy -= 6 * dt;
    pt.mesh.material.transparent = true;
    pt.mesh.material.opacity = Math.min(1, pt.life * 2);
  }
}

/** Resize the canvas to its element size (called on window resize). */
export function resizeRenderer(ctx) {
  const canvas = ctx.renderer.domElement;
  const w = canvas.clientWidth || 1280;
  const h = canvas.clientHeight || 800;
  ctx.renderer.setSize(w, h, false);
  ctx.camera.aspect = w / h;
  ctx.camera.updateProjectionMatrix();
}
