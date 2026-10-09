import type { GameModule } from "@/games/types";
import { createSkippingEngine } from "./engine";

const skipping: GameModule = {
  async prepare(graphics) {
    if (graphics === "3d") {
      const { createSkipping3D } = await import("./engine3d");
      return createSkipping3D;
    }
    return createSkippingEngine;
  },
  createEngine: createSkippingEngine,
  controls() {
    return { kind: "buttons", buttons: [{ id: "jump", label: "JUMP", sublabel: "OVER THE ROPE", key: "Space", tone: "primary" }] };
  },
};

export default skipping;
