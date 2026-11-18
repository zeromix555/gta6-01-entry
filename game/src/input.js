// SOLMAR HEAT v2
// Keyboard + mouse input. WASD moves, mouse drag orbits the camera,
// click shoots, E interacts, Shift runs, Space handbrakes, P pauses, M mutes, R reloads.
export const ACTION_INTERACT = 'interact';
export const ACTION_PAUSE = 'pause';
export const ACTION_MUTE = 'mute';
export const ACTION_RELOAD = 'reload';
export const ACTION_CONFIRM = 'confirm';

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'brake',
};

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set(); // edge-triggered, consumed by takeAction
  let mouseDown = false;
  let mouseClicked = false;
  let dragDX = 0;
  let dragDY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function onKeyDown(event) {
    if (event.repeat) return;
    const mapped = KEYMAP[event.code];
    if (mapped) { held.add(mapped); event.preventDefault(); }
    if (event.code === 'KeyE') pressed.add(ACTION_INTERACT);
    if (event.code === 'KeyP' || event.code === 'Escape') pressed.add(ACTION_PAUSE);
    if (event.code === 'KeyM') pressed.add(ACTION_MUTE);
    if (event.code === 'KeyR') pressed.add(ACTION_RELOAD);
    if (event.code === 'Enter' || event.code === 'Space') pressed.add(ACTION_CONFIRM);
  }
  function onKeyUp(event) {
    const mapped = KEYMAP[event.code];
    if (mapped) held.delete(mapped);
  }
  function onMouseDown(event) {
    mouseDown = true; dragging = true; lastX = event.clientX; lastY = event.clientY;
  }
  function onMouseMove(event) {
    if (!dragging) return;
    dragDX += event.clientX - lastX;
    dragDY += event.clientY - lastY;
    lastX = event.clientX; lastY = event.clientY;
  }
  function onMouseUp(event) {
    if (mouseDown && Math.abs(event.clientX - lastX) < 4 && Math.abs(event.clientY - lastY) < 4) mouseClicked = true;
    mouseDown = false; dragging = false;
  }
  function onBlur() { held.clear(); mouseDown = false; dragging = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);

  return {
    held,
    get mouseDown() { return mouseDown; },
    takeClick() { const c = mouseClicked; mouseClicked = false; return c; },
    takeDrag() { const d = { x: dragDX, y: dragDY }; dragDX = 0; dragDY = 0; return d; },
    takeAction(name) { const has = pressed.has(name); if (has) pressed.delete(name); return has; },
    hasAction(name) { return pressed.has(name); },
    clearActions() { pressed.clear(); mouseClicked = false; },
  };
}
