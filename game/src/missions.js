// SOLMAR HEAT v2
// Missions — the three-job story of Dario Cruz in Solmar City.
// A mission is a list of stages; each stage completes on a trigger
// (reach a place, enter/steal a car, collect, lose the cops, escape).
import { MISSIONS, PLACES } from './config.js';

export function createMissions() {
  return {
    index: 0, // which mission is active (0..2), 3 = all done (free roam)
    stage: 0,
    done: false,
    message: '',
    messageTimer: 0,
  };
}

export function currentMission(missions) {
  if (missions.index >= MISSIONS.length) return null;
  return MISSIONS[missions.index];
}

export function currentStage(missions) {
  const m = currentMission(missions);
  if (!m) return null;
  return m.stages[missions.stage] || null;
}

// Where the current objective marker sits on the map (or null).
export function objectiveTarget(missions, world) {
  const stage = currentStage(missions);
  if (!stage) return null;
  if (stage.target === 'homeCar') return { x: world.homeCar.x, z: world.homeCar.z };
  if (stage.target === 'comet') return { x: world.comet.x, z: world.comet.z };
  const place = PLACES[stage.target];
  // Mission markers sit on the place's road approach, never inside its walls.
  if (place && place.approach) return { x: place.approach.x, z: place.approach.z };
  return place ? { x: place.x, z: place.z } : null;
}

export function setMessage(missions, text, seconds = 3.5) {
  missions.message = text;
  missions.messageTimer = seconds;
}

// Advance the mission state machine. `events` carries what happened this step:
// { enteredCar, stoleCar, collected, grabbedCash, position, inCar }.
// Returns a list of happened things for the world to react to
// ('stage', 'missionDone', 'alarm', 'allDone').
export function missionsStep(missions, world, events, addWanted) {
  const out = [];
  const mission = currentMission(missions);
  if (!mission) return out;
  const stage = mission.stages[missions.stage];
  if (!stage) return out;
  const px = events.position.x; const pz = events.position.z;
  let advance = false;

  if (stage.kind === 'enterCar' && events.enteredCar) advance = true;
  else if (stage.kind === 'stealCar' && events.stoleCar) advance = true;
  else if (stage.kind === 'collect' && events.collected) advance = true;
  else if (stage.kind === 'grabCash' && events.grabbedCash) advance = true;
  else if (stage.kind === 'reach' || stage.kind === 'escape') {
    const target = objectiveTarget(missions, world);
    if (target && Math.hypot(target.x - px, target.z - pz) <= stage.radius) advance = true;
  } else if (stage.kind === 'loseCops') {
    if (world.wanted.stars === 0) advance = true;
  }

  if (advance) {
    missions.stage += 1;
    out.push('stage');
    if (stage.kind === 'stealCar') {
      addWanted(world.wanted, 2, 'Grand theft auto');
      setMessage(missions, 'STOLEN! The cops are on you — lose them!', 4);
      out.push('alarm');
    }
    if (stage.kind === 'grabCash') {
      addWanted(world.wanted, 4, 'Bank robbery');
      setMessage(missions, 'ALARM! Four stars — run for Pier 9!', 4);
      world.spawnGuards();
      out.push('alarm');
    }
    if (missions.stage >= mission.stages.length) {
      world.money += mission.reward;
      setMessage(missions, `${mission.title} COMPLETE — $${mission.reward.toLocaleString()} earned`, 5);
      out.push('missionDone');
      missions.index += 1;
      missions.stage = 0;
      if (missions.index >= MISSIONS.length) {
        missions.done = true;
        setMessage(missions, 'ALL MISSIONS DONE — Solmar City is yours. Free roam!', 6);
        out.push('allDone');
      } else {
        const next = MISSIONS[missions.index];
        setMessage(missions, `NEW MISSION: ${next.title} — ${next.brief}`, 6);
      }
    }
  }
  if (missions.messageTimer > 0) missions.messageTimer -= 1 / 60;
  return out;
}

export function missionObjectiveText(missions) {
  const mission = currentMission(missions);
  if (!mission) return 'FREE ROAM — Solmar City is yours';
  const stage = mission.stages[missions.stage];
  return `${mission.title} — ${stage ? stage.text : ''}`;
}
