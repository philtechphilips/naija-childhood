"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getGame } from "@/games/registry";
import type { GameResult, GameSlug } from "@/games/types";
import { createSfx, type Sfx } from "@/games/core/audio";
import { randomSeed, hashString } from "@/games/core/rng";
import { useProfile, type RecordOutcome } from "@/stores/profile-store";
import { useSettings } from "@/stores/settings-store";
import { useUi } from "@/stores/ui-store";
import { dailyChallenge, dayKey } from "@/lib/daily";
import { track } from "@/lib/analytics";
import { PreGame } from "./PreGame";
import { GameHost } from "./GameHost";
import { PostGame } from "./PostGame";

export interface PlayConfig {
  mode: string;
  options: Record<string, string>;
  seed: number;
}

function defaultsFor(slug: GameSlug, mode: string): Record<string, string> {
  const game = getGame(slug);
  const out: Record<string, string> = {};
  for (const o of game?.options ?? []) if (!o.modes || o.modes.includes(mode)) out[o.id] = o.defaultValue;
  return out;
}

export function GameScreen({ slug }: { slug: GameSlug }) {
  const game = getGame(slug);
  const params = useSearchParams();
  const fromDaily = params.get("daily") === "1";
  const challenge = useMemo(() => dailyChallenge(), []);

  const initialMode = useMemo(() => {
    if (fromDaily && challenge.game === slug) return challenge.mode;
    const requested = params.get("mode");
    return game?.modes.find((m) => m.id === requested && m.available)?.id ?? game?.modes[0]?.id ?? "";
  }, [fromDaily, challenge, slug, params, game]);

  const [mode, setMode] = useState(initialMode);
  const [options, setOptions] = useState<Record<string, string>>(() =>
    fromDaily && challenge.game === slug ? { ...defaultsFor(slug, initialMode), ...challenge.options } : defaultsFor(slug, initialMode),
  );
  const [phase, setPhase] = useState<"pre" | "play" | "post">("pre");
  const [config, setConfig] = useState<PlayConfig | null>(null);
  const [runId, setRunId] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [outcome, setOutcome] = useState<RecordOutcome | null>(null);
  const sfxRef = useRef<Sfx | null>(null);
  const sound = useSettings((s) => s.sound);
  const setImmersive = useUi((s) => s.setImmersive);

  useEffect(() => {
    track("game_opened", { game: slug });
  }, [slug]);

  useEffect(() => {
    setImmersive(phase === "play");
    return () => setImmersive(false);
  }, [phase, setImmersive]);

  useEffect(() => {
    sfxRef.current?.setEnabled(sound);
  }, [sound]);

  useEffect(() => () => sfxRef.current?.dispose(), []);

  const changeMode = (m: string) => {
    // Keep choices that still apply to the new mode; fill the rest with defaults.
    const defaults = defaultsFor(slug, m);
    setMode(m);
    setOptions((prev) => Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, prev[k] ?? v])));
  };

  const play = useCallback(
    (cfgMode = mode, cfgOptions = options) => {
      // Create/unlock audio inside the tap so mobile browsers allow sound.
      if (!sfxRef.current) sfxRef.current = createSfx(useSettings.getState().sound);
      sfxRef.current.unlock();
      const seed = slug === "suwe" && cfgMode === "daily" ? hashString(`suwe:${dayKey()}`) : randomSeed();
      setConfig({ mode: cfgMode, options: cfgOptions, seed });
      setResult(null);
      setOutcome(null);
      setRunId((n) => n + 1);
      setPhase("play");
      window.scrollTo(0, 0);
      track("game_started", { game: slug, mode: cfgMode });
      if (fromDaily) track("challenge_started", { game: slug });
    },
    [mode, options, slug, fromDaily],
  );

  const onEnd = useCallback(
    (r: GameResult) => {
      const rec = useProfile.getState().recordResult(r);
      setResult(r);
      setOutcome(rec);
      setPhase("post");
      track("game_completed", { game: r.game, mode: r.mode, score: r.score, won: r.won, duration: r.durationMs });
      if (rec.dailyCompleted) track("challenge_completed", { game: r.game });
      // Uploading happens in the background via the sync queue (recordResult enqueues it).
    },
    [],
  );

  if (!game) return null;

  if (phase === "play" && config && sfxRef.current) {
    return (
      <GameHost
        key={runId}
        game={game}
        config={config}
        sfx={sfxRef.current}
        onEnd={onEnd}
        onRestart={() => play(config.mode, config.options)}
        onQuit={() => setPhase("pre")}
      />
    );
  }

  if (phase === "post" && result && outcome) {
    return (
      <PostGame
        game={game}
        result={result}
        outcome={outcome}
        onRematch={() => {
          track("rematch_clicked", { game: slug });
          if (config) play(config.mode, config.options);
        }}
        onChangeMode={() => setPhase("pre")}
      />
    );
  }

  return (
    <PreGame
      game={game}
      mode={mode}
      options={options}
      onMode={changeMode}
      onOption={(id, v) => setOptions((o) => ({ ...o, [id]: v }))}
      onPlay={() => play()}
      dailyNote={fromDaily && challenge.game === slug ? challenge.description : null}
    />
  );
}
