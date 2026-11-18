// SOLMAR HEAT — input: keyboard and mouse, turned into one input object.
//
// The game reads keys by `code` (KeyW, ArrowUp, ...) so layouts do not
// matter. Movement keys are held state; E, R, P, Escape and Enter are
// edge-triggered — a press registers once, then clears at the end of the
// frame, so one tap never fires twice. The mouse does two jobs: dragging
// orbits the chase camera, and holding the button shoots.
//
// `readInput()` returns the exact object `worldStep` consumes:
// { moveX, moveY, run, throttle, steer, brake, interact, shoot, reload,
//   camDX, camDY }.

/** Create input state and attach listeners to the window and canvas. */
export function createInput(canvas, hooks) {
  const state = {
    keys: new Set(),
    mouseDown: false,
    dragging: false,
    lastX: 0,
    lastY: 0,
    camDX: 0,
    camDY: 0,
    interact: false,
    reload: false,
    pause: false,
    confirm: false,
    mute: false,
    horn: false,
    hooks: hooks || {},
  };

  window.addEventListener('keydown', (ev) => {
    // Do not steal keys from a focused form field (there are none, but be safe).
    if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA')) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(ev.code)) {
      ev.preventDefault(); // the page must not scroll while driving
    }
    if (ev.repeat) return;
    state.keys.add(ev.code);
    if (ev.code === 'KeyE') state.interact = true;
    if (ev.code === 'KeyR') state.reload = true;
    if (ev.code === 'KeyH') state.horn = true; // the horn: startles traffic
    if (ev.code === 'KeyP' || ev.code === 'Escape') state.pause = true;
    if (ev.code === 'Enter') state.confirm = true;
    if (ev.code === 'KeyM') state.mute = true;
  });

  window.addEventListener('keyup', (ev) => {
    state.keys.delete(ev.code);
  });

  window.addEventListener('blur', () => {
    // Losing the window clears held keys: no stuck throttle after alt-tab.
    state.keys.clear();
    state.mouseDown = false;
    state.dragging = false;
  });

  canvas.addEventListener('mousedown', (ev) => {
    state.mouseDown = true;
    state.dragging = true;
    state.lastX = ev.clientX;
    state.lastY = ev.clientY;
  });
  window.addEventListener('mouseup', () => {
    state.mouseDown = false;
    state.dragging = false;
  });
  window.addEventListener('mousemove', (ev) => {
    if (!state.dragging) return;
    state.camDX += ev.clientX - state.lastX;
    state.camDY += ev.clientY - state.lastY;
    state.lastX = ev.clientX;
    state.lastY = ev.clientY;
  });

  // A click on a HUD button must not also fire the pistol.
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  return state;
}

/** True when a key is currently held down. */
export function isDown(state, ...codes) {
  return codes.some((code) => state.keys.has(code));
}

/**
 * Read the current input as a worldStep object, consuming the edge flags
 * and the accumulated camera deltas. Call once per frame.
 */
export function readInput(state) {
  const moveY = (isDown(state, 'KeyW', 'ArrowUp') ? 1 : 0) - (isDown(state, 'KeyS', 'ArrowDown') ? 1 : 0);
  const moveX = (isDown(state, 'KeyD', 'ArrowRight') ? 1 : 0) - (isDown(state, 'KeyA', 'ArrowLeft') ? 1 : 0);
  const out = {
    moveX,
    moveY,
    run: isDown(state, 'ShiftLeft', 'ShiftRight'),
    throttle: moveY > 0 ? 1 : 0,
    steer: moveX,
    brake: moveY < 0 || isDown(state, 'Space'),
    interact: state.interact,
    shoot: state.mouseDown,
    reload: state.reload,
    camDX: state.camDX,
    camDY: state.camDY,
    pause: state.pause,
    confirm: state.confirm,
    mute: state.mute,
    horn: state.horn,
  };
  // Edges and camera deltas are consumed by this read.
  state.interact = false;
  state.reload = false;
  state.pause = false;
  state.confirm = false;
  state.mute = false;
  state.horn = false;
  state.camDX = 0;
  state.camDY = 0;
  return out;
}
