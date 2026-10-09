/** Keyboard (WASD/arrows + Shift) and virtual-joystick input for the chase. */
export function createChaseInput() {
  const keys = new Set<string>();
  let axis = { x: 0, y: 0 };
  let sprintHeld = false;
  const tracked = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"];
  const onDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (tracked.includes(k)) {
      keys.add(k);
      e.preventDefault();
    }
  };
  const onUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  const clear = () => keys.clear();
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  window.addEventListener("blur", clear);

  return {
    /** Screen-space direction: x right, y down (towards the viewer). Length ≤ 1. */
    dir() {
      let x = axis.x;
      let y = axis.y;
      if (keys.has("a") || keys.has("arrowleft")) x -= 1;
      if (keys.has("d") || keys.has("arrowright")) x += 1;
      if (keys.has("w") || keys.has("arrowup")) y -= 1;
      if (keys.has("s") || keys.has("arrowdown")) y += 1;
      const len = Math.hypot(x, y);
      return len > 1 ? { x: x / len, y: y / len } : { x, y };
    },
    sprint: () => sprintHeld || keys.has("shift"),
    setAxis(x: number, y: number) {
      axis = { x, y };
    },
    setSprint(v: boolean) {
      sprintHeld = v;
    },
    clear,
    dispose() {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clear);
    },
  };
}
