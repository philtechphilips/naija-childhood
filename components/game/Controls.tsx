"use client";

import { useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import type { ControlButton, ControlSpec, GameEngine } from "@/games/types";
import styles from "./Controls.module.css";

type EngineRef = MutableRefObject<GameEngine | null>;

function PadButton({ b, engine }: { b: ControlButton; engine: EngineRef }) {
  const [down, setDown] = useState(false);
  const press = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDown(true);
    engine.current?.input(b.id, true);
  };
  const release = () => {
    if (!down) return;
    setDown(false);
    engine.current?.input(b.id, false);
  };
  return (
    <button
      type="button"
      className={`${styles.pad} ${styles[b.tone ?? "primary"]} ${down ? styles.down : ""}`}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
      // Keyboard users trigger through the engine's own key bindings; this keeps Enter/Space working on the focused button too.
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          engine.current?.input(b.id, true);
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") engine.current?.input(b.id, false);
      }}
    >
      {b.sublabel && <span className={styles.sub}>{b.sublabel}</span>}
      <span className={styles.padLabel}>{b.label}</span>
      <kbd className={styles.key}>{b.key}</kbd>
    </button>
  );
}

function Joystick({ engine }: { engine: EngineRef }) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState<{ ox: number; oy: number; dx: number; dy: number } | null>(null);
  const pointer = useRef<number | null>(null);
  const RADIUS = 52;

  const move = (clientX: number, clientY: number, origin: { ox: number; oy: number }) => {
    let dx = clientX - origin.ox;
    let dy = clientY - origin.oy;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setStick({ ...origin, dx, dy });
    engine.current?.axis?.(dx / RADIUS, dy / RADIUS);
  };

  return (
    <div
      ref={zoneRef}
      className={styles.stickZone}
      onPointerDown={(e) => {
        if (pointer.current !== null) return;
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        const rect = e.currentTarget.getBoundingClientRect();
        const origin = { ox: e.clientX - rect.left, oy: e.clientY - rect.top };
        setStick({ ...origin, dx: 0, dy: 0 });
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== pointer.current || !stick) return;
        const rect = e.currentTarget.getBoundingClientRect();
        move(e.clientX - rect.left, e.clientY - rect.top, stick);
      }}
      onPointerUp={(e) => {
        if (e.pointerId !== pointer.current) return;
        pointer.current = null;
        setStick(null);
        engine.current?.axis?.(0, 0);
      }}
      onPointerCancel={() => {
        pointer.current = null;
        setStick(null);
        engine.current?.axis?.(0, 0);
      }}
      aria-hidden="true"
    >
      {stick ? (
        <div className={styles.stickBase} style={{ left: stick.ox, top: stick.oy }}>
          <div className={styles.stickKnob} style={{ transform: `translate(${stick.dx}px, ${stick.dy}px)` }} />
        </div>
      ) : (
        <div className={styles.stickHint}>
          <div className={styles.stickBase} style={{ position: "relative", left: "auto", top: "auto", margin: 0 }}>
            <div className={styles.stickKnob} />
          </div>
          <span>Drag to run</span>
        </div>
      )}
    </div>
  );
}

/** Full-screen swipe pad: one action per swipe, fired as soon as the finger has moved far enough. */
function SwipePad({ engine }: { engine: EngineRef }) {
  const start = useRef<{ x: number; y: number; id: number; fired: boolean } | null>(null);
  const fire = (id: string) => {
    engine.current?.input(id, true);
    engine.current?.input(id, false);
  };
  return (
    <div
      className={styles.swipe}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, fired: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s || s.fired || e.pointerId !== s.id) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.hypot(dx, dy) < 24) return;
        s.fired = true;
        fire(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "jump" : "slide");
      }}
      onPointerUp={() => {
        start.current = null;
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      aria-hidden="true"
    />
  );
}

export function Controls({ spec, engine, overlay = false }: { spec: ControlSpec; engine: EngineRef; overlay?: boolean }) {
  if (spec.kind === "swipe") return <SwipePad engine={engine} />;
  if (spec.kind === "joystick") {
    return (
      <div className={styles.overlay}>
        <Joystick engine={engine} />
        <div className={styles.overlayButtons}>
          {spec.buttons.map((b) => (
            <PadButton key={b.id} b={b} engine={engine} />
          ))}
        </div>
      </div>
    );
  }
  if (spec.split) {
    const half = Math.ceil(spec.buttons.length / 2);
    return (
      <div className={`${styles.bar} ${styles.split}`} data-overlay={overlay}>
        <div className={styles.group}>
          {spec.buttons.slice(0, half).map((b) => (
            <PadButton key={b.id} b={b} engine={engine} />
          ))}
        </div>
        <div className={styles.group}>
          {spec.buttons.slice(half).map((b) => (
            <PadButton key={b.id} b={b} engine={engine} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className={styles.bar}>
      <div className={styles.group}>
        {spec.buttons.map((b) => (
          <PadButton key={b.id} b={b} engine={engine} />
        ))}
      </div>
    </div>
  );
}
