import type { GameModule } from "@/games/types";
import { createSuweEngine } from "./engine";

const suwe: GameModule = {
  async prepare(graphics) {
    if (graphics === "3d") {
      const { createSuwe3D } = await import("./engine3d");
      return createSuwe3D;
    }
    return createSuweEngine;
  },
  createEngine: createSuweEngine,
  controls() {
    return {
      kind: "buttons",
      buttons: [
        { id: "hop", label: "Hop", sublabel: "ONE FOOT", key: "F / ←", tone: "primary" },
        { id: "split", label: "Split", sublabel: "BOTH FEET", key: "J / →", tone: "accent" },
      ],
    };
  },
};

export default suwe;
