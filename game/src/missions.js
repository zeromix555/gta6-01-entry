// SOLMAR HEAT — the three-mission story and its stage machine.
//
// Mission stages: 1 = "drive to the objective", 2 = "collect the package"
// (arriving within 10 m promotes the stage), 3 = "mission complete"
// (interact at the objective banks the reward and advances the story).
// The stage machine is deliberately small and explicit: the self-test walks
// it 1 → 2 → 3 for mission 0, and the same code runs all three missions.
//
// Mission 2, the bank job, is the only one with armed resistance: the four
// bank guards come out when you arrive, and they shoot at you while you
// are inside their range.

import { MISSIONS, COMBAT, PLACES, ECONOMY } from './config.js';
import { dist2d } from './random.js';
import { playerPos, onEvent, saveGame } from './world.js';
import { damagePlayer } from './player.js';

/** Fresh mission state: mission 0, stage 1, nothing done. */
export function createMissions() {
  return {
    index: 0,
    stage: 1,
    done: [false, false, false],
    guardsSpawned: false,
    pendingReset: false,
    resetIn: 0,
  };
}

/** Objective point of mission `index` (a fresh { x, z } copy). */
export function objectiveTarget(index) {
  const m = MISSIONS[index] || MISSIONS[0];
  return { x: m.objective.x, z: m.objective.z };
}

/** Current stage number (1, 2 or 3) — a tiny accessor for other modules. */
export function missionStageAt(world) {
  return world.missions.stage;
}

/** One-line mission text for the HUD. */
export function missionText(world) {
  const m = world.missions;
  if (m.index >= MISSIONS.length) {
    return 'All jobs done — Solmar is yours. Roam free.';
  }
  const def = MISSIONS[m.index];
  const stageText =
    m.stage === 1
      ? `Drive to the marker — ${def.brief}`
      : m.stage === 2
        ? 'Package is here — press E to collect it.'
        : 'Job done.';
  return `Job ${m.index + 1}/3 — ${def.name}: ${stageText}`;
}

/** Advance the stage machine and the bank guards, one step. */
export function updateMissions(world, dt) {
  const m = world.missions;
  if (m.index >= MISSIONS.length) return;

  // A completed mission holds stage 3 ("Job done.") for two steps so the
  // player — and the self-test reading the stage right after the collect —
  // sees the completion, and only then does the next job begin at stage 1.
  if (m.pendingReset) {
    m.resetIn -= 1;
    if (m.resetIn <= 0) {
      m.pendingReset = false;
      m.stage = 1;
    }
    return;
  }

  // Arriving at the objective promotes stage 1 to stage 2.
  if (m.stage === 1) {
    const pos = playerPos(world);
    const obj = world.objective;
    if (dist2d(pos.x, pos.z, obj.x, obj.z) < 10) {
      m.stage = 2;
      onEvent(world, 'mission-arrive', { mission: m.index });
      if (m.index === 2 && !m.guardsSpawned) {
        spawnGuards(world);
      }
    }
  }

  updateGuards(world, dt);
}

/** Collect the package: bank the reward, advance the story, maybe win. */
export function collectMissionPackage(world) {
  const m = world.missions;
  if (m.index >= MISSIONS.length) return false;
  if (m.stage !== 2) return false;
  const pos = playerPos(world);
  if (dist2d(pos.x, pos.z, world.objective.x, world.objective.z) >= 10) return false;

  const def = MISSIONS[m.index];
  m.stage = 3;
  m.done[m.index] = true;
  world.money += def.reward;
  // Clean getaway: finish a job with zero wanted stars and the crew pays
  // a bonus for not bringing the heat down on everyone.
  let bonus = 0;
  if (world.wanted.stars === 0) {
    bonus = ECONOMY.cleanBonus;
    world.money += bonus;
  }
  world.stats.missionsDone += 1;
  onEvent(world, 'mission-complete', { mission: m.index, reward: def.reward, bonus, money: world.money });
  saveGame(world);

  if (m.index >= MISSIONS.length - 1) {
    // The bank job was the last one: the story is won.
    world.winShown = true;
    world.screen = 'win';
    onEvent(world, 'game-win', { money: world.money });
    return true;
  }

  // Next job: stage stays 3 for two steps (see updateMissions), then the
  // next mission begins at stage 1 with a fresh objective. Guards stand down.
  m.index += 1;
  m.stage = 3;
  m.pendingReset = true;
  m.resetIn = 2;
  m.guardsSpawned = false;
  world.guards.length = 0;
  world.objective = objectiveTarget(m.index);
  return true;
}

/** Four armed guards outside the bank, facing the road. */
export function spawnGuards(world) {
  const m = world.missions;
  if (m.guardsSpawned) return;
  m.guardsSpawned = true;
  const spots = [
    { x: -47, z: -50 },
    { x: -47, z: -62 },
    { x: -52, z: -56 },
    { x: -45, z: -53 },
  ];
  spots.forEach((spot, i) => {
    world.guards.push({
      id: `guard-${i}`,
      x: spot.x,
      z: spot.z,
      heading: Math.PI / 2, // facing the road (east)
      health: COMBAT.guardHealth,
      fireCooldown: 0.4 + i * 0.3,
      mesh: null,
    });
  });
  onEvent(world, 'guards-out', { count: world.guards.length });
}

/** Guards face you and shoot while you are inside their range. */
export function updateGuards(world, dt) {
  const pos = playerPos(world);
  for (const guard of world.guards) {
    if (guard.health <= 0) continue;
    const d = dist2d(pos.x, pos.z, guard.x, guard.z);
    guard.heading = Math.atan2(pos.x - guard.x, pos.z - guard.z);
    if (d > COMBAT.guardRange) continue;
    if (world.screen !== 'play') continue;
    guard.fireCooldown -= dt;
    if (guard.fireCooldown <= 0) {
      guard.fireCooldown = COMBAT.guardFireInterval;
      damagePlayer(world, COMBAT.guardDamage, 'guard');
      onEvent(world, 'guard-shot', { guard: guard.id });
    }
  }
}
