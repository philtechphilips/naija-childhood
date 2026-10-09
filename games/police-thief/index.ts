import type { EngineContext, GameModule } from "@/games/types";
import { createPoliceThiefEngine } from "./engine";

const policeThief: GameModule = {
  async prepare(graphics) {
    // Street run (endless runner) and the compound chase share the slug; pick by mode at start.
    if (graphics === "3d") {
      const [{ createPoliceThief3D }, { createPoliceRun3D }] = await Promise.all([import("./engine3d"), import("./run3d")]);
      return (ctx: EngineContext) => (ctx.mode === "run" ? createPoliceRun3D(ctx) : createPoliceThief3D(ctx));
    }
    const { createPoliceRun2D } = await import("./run2d");
    return (ctx: EngineContext) => (ctx.mode === "run" ? createPoliceRun2D(ctx) : createPoliceThiefEngine(ctx));
  },
  createEngine: createPoliceThiefEngine,
  controls(mode) {
    if (mode === "run") return { kind: "swipe" };
    return {
      kind: "joystick",
      buttons: [{ id: "sprint", label: "Sprint", key: "Shift", tone: "secondary" }],
    };
  },
};

export default policeThief;
