"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ControlSpec, EngineContext, GameDefinition, GameEngine, GameModule, GameResult } from "@/games/types";
import { webglAvailable } from "@/games/core3d/support";
import type { Sfx } from "@/games/core/audio";
import { useProfile } from "@/stores/profile-store";
import { prefersReducedMotion, useSettings } from "@/stores/settings-store";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { Controls } from "./Controls";
import type { PlayConfig } from "./GameScreen";
import styles from "./GameHost.module.css";

/**
 * Mounts a game engine on a canvas. React never re-renders during play:
 * the engine owns its loop, and this component only forwards input.
 */
export function GameHost({
  game,
  config,
  sfx,
  onEnd,
  onRestart,
  onQuit,
}: {
  game: GameDefinition;
  config: PlayConfig;
  sfx: Sfx;
  onEnd: (r: GameResult) => void;
  onRestart: () => void;
  onQuit: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [module, setModule] = useState<GameModule | null>(null);
  const [factory, setFactory] = useState<((c: EngineContext) => GameEngine) | null>(null);
  const graphics = useMemo<"3d" | "2d">(() => {
    const pref = useSettings.getState().graphics;
    if (pref === "2d") return "2d";
    return webglAvailable() ? "3d" : "2d";
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const sound = useSettings((s) => s.sound);
  const music = useSettings((s) => s.music);
  const setSettings = useSettings((s) => s.set);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    let alive = true;
    game
      .load()
      .then(async (m) => {
        const make = m.prepare ? await m.prepare(graphics) : m.createEngine;
        if (!alive) return;
        setFactory(() => make);
        setModule(m);
      })
      .catch(() => alive && setError("Couldn't load the game. Check your connection and try again."));
    return () => {
      alive = false;
    };
  }, [game, graphics]);

  useEffect(() => {
    if (!module || !factory || !canvasRef.current) return;
    const settings = useSettings.getState();
    let engine: GameEngine;
    try {
      engine = factory({
        canvas: canvasRef.current,
        mode: config.mode,
        options: config.options,
        seed: config.seed,
        playerName: useProfile.getState().name,
        reducedMotion: prefersReducedMotion(settings.reducedMotion),
        graphics,
        sfx,
        music: settings.music,
        haptic: (pattern) => {
          if (useSettings.getState().haptics) navigator.vibrate?.(pattern);
        },
        onEnd: (r) => onEndRef.current(r),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "This device can't run the game.");
      track("error", { where: "engine_create", game: game.slug });
      return;
    }
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [module, factory, config, sfx, game.slug, graphics]);

  useEffect(() => {
    engineRef.current?.setPaused(paused);
  }, [paused]);

  // Auto-pause when the app is backgrounded (call comes in, tab switch).
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "p" || e.key === "P") setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const spec: ControlSpec | null = module ? module.controls(config.mode, config.options) : null;
  const overlay = spec?.kind === "joystick" || spec?.kind === "swipe";

  return (
    <div className={styles.host} data-overlay={overlay}>
      <div className={styles.stage}>
        <canvas ref={canvasRef} className={styles.canvas} aria-label={`${game.name} game`} role="img" />
        <div className={styles.topButtons}>
          <button type="button" className={styles.topBtn} onClick={() => setPaused(true)} aria-label="Pause">
            <Icon name="pause" size={18} />
          </button>
          {/* Sound on/off for everything: effects, music, voices and the street. */}
          <button
            type="button"
            className={`${styles.topBtn} ${sound ? "" : styles.muted}`}
            aria-pressed={!sound}
            aria-label={sound ? "Turn sound off" : "Turn sound on"}
            onClick={() => {
              setSettings({ sound: !sound });
              sfx.setEnabled(!sound);
            }}
          >
            <Icon name={sound ? "volume" : "mute"} size={18} />
          </button>
        </div>
        {!module && !error && (
          <div className={styles.loading}>
            <span className={styles.spinner} />
            Loading {game.name}…
          </div>
        )}
        {error && (
          <div className={styles.loading}>
            <p>{error}</p>
            <Button variant="secondary" onClick={onQuit}>
              Back
            </Button>
          </div>
        )}
        {spec && overlay && <Controls spec={spec} engine={engineRef} overlay />}
      </div>
      {spec && !overlay && <Controls spec={spec} engine={engineRef} />}

      {paused && (
        <div className={styles.pauseLayer} role="dialog" aria-modal="true" aria-label="Paused">
          <div className={styles.pauseCard}>
            <h2>Paused</h2>
            <Button size="lg" block icon="play" onClick={() => setPaused(false)} autoFocus>
              Resume
            </Button>
            <Button size="lg" block variant="secondary" icon="refresh" onClick={onRestart}>
              Restart
            </Button>
            <Button
              size="lg"
              block
              variant="secondary"
              icon={sound ? "volume" : "mute"}
              onClick={() => {
                setSettings({ sound: !sound });
                sfx.setEnabled(!sound);
              }}
            >
              Sound {sound ? "on" : "off"}
            </Button>
            <Button
              size="lg"
              block
              variant="secondary"
              icon={music ? "volume" : "mute"}
              onClick={() => {
                setSettings({ music: !music });
                engineRef.current?.setMusic?.(!music);
              }}
            >
              Music {music ? "on" : "off"}
            </Button>
            <Button size="lg" block variant="ghost" icon="close" onClick={onQuit}>
              Quit game
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
