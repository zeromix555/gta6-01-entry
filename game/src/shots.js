// SOLMAR HEAT v3
// Staged screenshot scenes behind ?shot=chase|street|mission|start.
// Each scene plays the real rules forward from a fresh world for a fixed
// number of steps, steered by a scripted autopilot, so the frame is what a
// short stretch of real play looks like — and the same seed always gives
// the same frame.
import { STEP, PLACES } from './config.js';
import { SCREEN_TITLE, SCREEN_PLAY } from './render.js';
import { spawnGuards, worldStep } from './world.js';

const SAMPLE = STEP;

function blankInput() {
  return {
    moveX: 0, moveY: 0, run: false,
    throttle: 0, steer: 0, brake: false,
    interact: false, shoot: false, reload: false,
    camDX: 0, camDY: 0,
  };
}

function stepFor(world, seconds, inputFn, updateCam) {
  const steps = Math.round(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    worldStep(world, SAMPLE, inputFn(i, steps));
    if (updateCam) updateCam();
  }
}

/**
 * Put `world` into the named scene and return the screen to draw over it.
 * Scenes:
 *  start   — title screen: Dario by his sedan, traffic rolling past.
 *  chase   — cover: Comet GT tearing down the avenue, three cop cars on its tail, 3 stars.
 *  street  — on foot downtown: traffic, pedestrians, mission marker ahead.
 *  mission — the bank job: guards, muzzle flash, 4 stars, cops closing in.
 */
export function stageShot(name, world, updateCam) {
  const p = world.player;
  if (name === 'chase') {
    // Put Dario in the Comet GT on the central avenue, cops in pursuit.
    const comet = world.comet;
    comet.parked = false;
    comet.x = -120; comet.z = 0; comet.heading = Math.PI / 2; comet.speed = 18;
    comet.mesh.position.set(comet.x, 0, comet.z);
    p.inCar = comet;
    p.mesh.visible = false;
    p.x = comet.x; p.z = comet.z;
    p.camYaw = Math.PI / 2; p.camPitch = 0.3;
    world.wanted.stars = 3;
    world.missions.index = 1; world.missions.stage = 2; // M2: lose the cops
    world.money = 1250;
    // Seed two traffic cars on the avenue ahead so the road is alive.
    const t0 = world.traffic[0]; const t1 = world.traffic[1];
    t0.x = -40; t0.z = 3.5; t0.heading = Math.PI / 2; t0.speed = 11; t0.target = { x: 174, z: 3.5 };
    t1.x = 60; t1.z = -3.5; t1.heading = -Math.PI / 2; t1.speed = 10; t1.target = { x: -174, z: -3.5 };
    stepFor(world, 4.5, (i) => {
      const input = blankInput();
      input.throttle = 1;
      // Hold the avenue: steer back toward z = 0 and heading PI/2.
      const headingErr = comet.heading - Math.PI / 2;
      input.steer = Math.max(-1, Math.min(1, -(comet.z * 0.06 + headingErr * 2.2)));
      return input;
    }, updateCam);
    // Pose the pursuit for the frame: two cop cars flanking the Comet just
    // behind it, one more closing from the side ahead — all inside the view.
    const fx = Math.sin(comet.heading); const fz = Math.cos(comet.heading);
    const rx = -Math.cos(comet.heading); const rz = Math.sin(comet.heading);
    const poses = [
      { along: -7, side: -6.5 }, { along: -11, side: 6.5 }, { along: 16, side: -8 }, { along: -20, side: 0 },
    ];
    world.wanted.cops.forEach((cop, i) => {
      const pose = poses[i % poses.length];
      cop.x = comet.x + fx * pose.along + rx * pose.side;
      cop.z = comet.z + fz * pose.along + rz * pose.side;
      cop.heading = comet.heading;
      cop.speed = 26;
      cop.mesh.position.set(cop.x, 0, cop.z);
    });
    stepFor(world, 0.7, (i) => {
      const input = blankInput();
      input.throttle = 1;
      const headingErr = comet.heading - Math.PI / 2;
      input.steer = Math.max(-1, Math.min(1, -(comet.z * 0.06 + headingErr * 2.2)));
      return input;
    }, updateCam);
    return { screen: SCREEN_PLAY };
  }

  if (name === 'street') {
    // On foot in the middle of the (0, 58) crossroads, mission 1 active.
    // The camera looks east down the avenue, so the road — never a building
    // face — fills the frame, with traffic crossing right in front of Dario.
    p.x = 0; p.z = 58; p.heading = Math.PI / 2; p.camYaw = Math.PI / 2; p.camPitch = 0.28;
    p.mesh.position.set(p.x, 0, p.z);
    world.missions.index = 0; world.missions.stage = 1; // M1: drive to the diner
    world.money = 120;
    const s0 = world.traffic[0]; const s1 = world.traffic[1];
    s0.x = -70; s0.z = 61.5; s0.heading = Math.PI / 2; s0.speed = 11; s0.target = { x: 174, z: 58 };
    s1.x = 3.5; s1.z = -10; s1.heading = 0; s1.speed = 10; s1.target = { x: 0, z: 174 };
    stepFor(world, 5, (i) => {
      const input = blankInput();
      input.moveY = 0.5; // stroll east down the avenue
      return input;
    }, updateCam);
    return { screen: SCREEN_PLAY };
  }

  if (name === 'mission') {
    // The bank job: Dario on foot outside Solmar Trust, guards out, 4 stars.
    // Camera sits front-right so the bank shows at an angle, guards in the open.
    world.missions.index = 2; world.missions.stage = 2; // M3: escape to the hideout
    world.wanted.stars = 4;
    world.money = 3050;
    spawnGuards(world);
    // Dario south of the bank, guards between him and its doors.
    p.x = 35; p.z = 112; p.heading = Math.PI; p.camYaw = Math.PI + 0.45; p.camPitch = 0.26;
    p.mesh.position.set(p.x, 0, p.z);
    stepFor(world, 3.5, (i) => {
      const input = blankInput();
      // Fire in bursts at the guards.
      input.shoot = (i % 30) < 12;
      return input;
    }, updateCam);
    return { screen: SCREEN_PLAY };
  }

  // Default: title screen over a living city — Dario by his sedan.
  p.x = -47.5; p.z = -14; p.heading = -2.82; p.camYaw = -2.82; p.camPitch = 0.3;
  p.mesh.position.set(p.x, 0, p.z);
  stepFor(world, 6, () => blankInput(), updateCam);
  return { screen: SCREEN_TITLE, best: 0 };
}
