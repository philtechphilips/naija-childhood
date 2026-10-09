import type { GameModule } from "@/games/types";
import { createSackRaceEngine } from "./engine";

const sackRace: GameModule = {
  async prepare(graphics) {
    if (graphics === "3d") {
      const { createSackRace3D } = await import("./engine3d");
      return createSackRace3D;
    }
    return createSackRaceEngine;
  },
  createEngine: createSackRaceEngine,
  controls(mode) {
    if (mode === "obstacles") {
      return {
        kind: "buttons",
        buttons: [
          { id: "hop", label: "HOP", sublabel: "AS YOU LAND", key: "F / Space", tone: "primary" },
          { id: "leap", label: "LEAP", sublabel: "OVER HURDLES", key: "J / Shift", tone: "accent" },
        ],
      };
    }
    return { kind: "buttons", buttons: [{ id: "hop", label: "HOP", sublabel: "AS YOU LAND", key: "Space", tone: "primary" }] };
  },
};

export default sackRace;
