"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createStage } from "@/games/core3d/stage";
import { buildStreet } from "@/games/core3d/street";
import { createCrowd } from "@/games/core3d/crowd";
import { Character } from "@/games/core3d/character";

/** Development-only preview of the 3D street (not linked from the app). */
export function StreetPreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    if (!ref.current) return;
    const params = new URLSearchParams(location.search);
    const view = params.get("view") ?? "street";
    const stage = createStage(ref.current, { quality: (params.get("q") as "high" | "medium" | "low") ?? "high" });
    let raf = 0;
    let alive = true;
    (async () => {
      await buildStreet(stage.scene, { detailed: true });
      const crowd = await createCrowd(stage.scene, { walkers: Number(params.get("walkers") ?? 14), traffic: 8 });
      const kid = await Character.create(params.get("kid") ?? "tunde", ["run_m", "idle_m"]);
      stage.scene.add(kid.root);
      kid.root.position.set(20, 0, 24.5);
      kid.play(params.get("anim") ?? "run_m");
      const cams: Record<string, [number[], number[]]> = {
        street: [[14, 2.2, 21], [24, 1.6, 26]],
        market: [[8, 2.4, 19], [18, 1.4, 9]],
        wide: [[-6, 9, 24], [30, 2, 24]],
        kid: [[18.2, 1.5, 22.6], [20, 1.0, 24.5]],
        side: [[34, 1.8, 30], [34, 1.5, 42]],
        face: [[20, 1.3, 27.5], [20, 1.0, 24.5]],
      };
      const [pos, look] = cams[view] ?? cams.street!;
      stage.camera.position.set(pos[0]!, pos[1]!, pos[2]!);
      stage.camera.lookAt(new THREE.Vector3(look[0], look[1], look[2]));
      stage.focusShadows(new THREE.Vector3(look[0], 0, look[2]));
      const clock = new THREE.Clock();
      setStatus("ready");
      const loop = () => {
        if (!alive) return;
        raf = requestAnimationFrame(loop);
        const dt = Math.min(clock.getDelta(), 0.05);
        crowd.update(dt, stage.camera.position);
        kid.update(dt);
        stage.render();
      };
      loop();
    })().catch((e) => setStatus(`error: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stage.dispose();
    };
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 100 }}>
      <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />
      <div id="status" style={{ position: "absolute", top: 8, left: 8, color: "#fff", font: "12px monospace" }}>
        {status}
      </div>
    </div>
  );
}
