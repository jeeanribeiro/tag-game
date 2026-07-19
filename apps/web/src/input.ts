export interface CurrentInput {
  moveX: number;
  moveY: number;
  sprint: boolean;
}

export interface InputController {
  current: () => CurrentInput;
}

const JOYSTICK_RADIUS = 56;

/**
 * Merges keyboard (WASD/arrows + Shift/Space sprint) and a dynamic-origin
 * touch joystick (left area) with a sprint button (bottom right).
 */
export function createInputController(elements: {
  joyBase: HTMLElement;
  joyThumb: HTMLElement;
  sprintButton: HTMLElement;
}): InputController {
  const keys = new Set<string>();
  let joystickPointer: number | null = null;
  let joystickOrigin = { x: 0, y: 0 };
  let joystickVector = { x: 0, y: 0 };
  let touchSprint = false;

  const { joyBase, joyThumb, sprintButton } = elements;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      event.preventDefault();
    }
    keys.add(event.key.length === 1 ? event.key.toLowerCase() : event.key);
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
  });
  window.addEventListener('blur', () => {
    keys.clear();
  });

  // Touch joystick with a dynamic origin: press anywhere (except UI) to steer.
  window.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    const target = event.target as HTMLElement | null;
    if (target && (target.closest('button') || target.closest('input'))) return;
    if (joystickPointer !== null) return;
    joystickPointer = event.pointerId;
    joystickOrigin = { x: event.clientX, y: event.clientY };
    joystickVector = { x: 0, y: 0 };
    positionJoystick(event.clientX, event.clientY, event.clientX, event.clientY);
    joyBase.classList.remove('hidden');
    joyThumb.classList.remove('hidden');
  });
  window.addEventListener('pointermove', (event) => {
    if (event.pointerId !== joystickPointer) return;
    let dx = event.clientX - joystickOrigin.x;
    let dy = event.clientY - joystickOrigin.y;
    const distance = Math.hypot(dx, dy);
    if (distance > JOYSTICK_RADIUS) {
      dx = (dx / distance) * JOYSTICK_RADIUS;
      dy = (dy / distance) * JOYSTICK_RADIUS;
    }
    joystickVector = { x: dx / JOYSTICK_RADIUS, y: dy / JOYSTICK_RADIUS };
    positionJoystick(
      joystickOrigin.x,
      joystickOrigin.y,
      joystickOrigin.x + dx,
      joystickOrigin.y + dy,
    );
  });
  const endJoystick = (event: PointerEvent): void => {
    if (event.pointerId !== joystickPointer) return;
    joystickPointer = null;
    joystickVector = { x: 0, y: 0 };
    joyBase.classList.add('hidden');
    joyThumb.classList.add('hidden');
  };
  window.addEventListener('pointerup', endJoystick);
  window.addEventListener('pointercancel', endJoystick);

  sprintButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    touchSprint = true;
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
    sprintButton.addEventListener(type, () => {
      touchSprint = false;
    });
  }

  // Only surface the sprint button on coarse-pointer (touch) devices.
  if (window.matchMedia('(pointer: coarse)').matches) {
    sprintButton.classList.remove('hidden');
  }

  function positionJoystick(baseX: number, baseY: number, thumbX: number, thumbY: number): void {
    joyBase.style.transform = `translate(${baseX - 56}px, ${baseY - 56}px)`;
    joyThumb.style.transform = `translate(${thumbX - 24}px, ${thumbY - 24}px)`;
  }

  function keyboardVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (keys.has('w') || keys.has('ArrowUp')) y -= 1;
    if (keys.has('s') || keys.has('ArrowDown')) y += 1;
    if (keys.has('a') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('d') || keys.has('ArrowRight')) x += 1;
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.SQRT2;
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }

  return {
    current(): CurrentInput {
      const usingJoystick = joystickPointer !== null;
      const vector = usingJoystick ? joystickVector : keyboardVector();
      return {
        moveX: vector.x,
        moveY: vector.y,
        sprint: touchSprint || keys.has('Shift') || keys.has(' '),
      };
    },
  };
}
