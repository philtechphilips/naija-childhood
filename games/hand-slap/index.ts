import type { GameModule } from "@/games/types";
import { createHandSlapEngine } from "./engine";

const handSlap: GameModule = {
  async prepare(graphics) {
    if (graphics === "3d") {
      const { createHandSlap3D } = await import("./engine3d");
      return createHandSlap3D;
    }
    return createHandSlapEngine;
  },
  createEngine: createHandSlapEngine,
  controls() {
    return {
      kind: "buttons",
      buttons: [
        { id: "fake", label: "FAKE", sublabel: "TRICK HIM", key: "F", tone: "secondary" },
        { id: "act", label: "SLAP!", sublabel: "OR PULL AWAY", key: "Space", tone: "primary" },
      ],
    };
  },
};

export default handSlap;
