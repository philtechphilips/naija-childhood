import type { GameModule } from "@/games/types";
import { createTenTenEngine } from "./engine";

const tenTen: GameModule = {
  async prepare(graphics) {
    if (graphics === "3d") {
      const { createTenTen3D } = await import("./engine3d");
      return createTenTen3D;
    }
    return createTenTenEngine;
  },
  createEngine: createTenTenEngine,
  controls(mode) {
    if (mode === "local") {
      return {
        kind: "buttons",
        split: true,
        buttons: [
          { id: "p1L", label: "Left", sublabel: "P1", key: "A", tone: "primary" },
          { id: "p1R", label: "Right", sublabel: "P1", key: "D", tone: "primary" },
          { id: "p2L", label: "Left", sublabel: "P2", key: "←", tone: "accent" },
          { id: "p2R", label: "Right", sublabel: "P2", key: "→", tone: "accent" },
        ],
      };
    }
    return {
      kind: "buttons",
      buttons: [
        { id: "p1L", label: "Left foot", key: "A / ←", tone: "primary" },
        { id: "p1R", label: "Right foot", key: "D / →", tone: "primary" },
      ],
    };
  },
};

export default tenTen;
