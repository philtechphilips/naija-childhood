import type { GameModule } from "@/games/types";
import { createHideSeekEngine } from "./engine";

const hideSeek: GameModule = {
  async prepare(graphics) {
    if (graphics === "3d") {
      const { createHideSeek3D } = await import("./engine3d");
      return createHideSeek3D;
    }
    return createHideSeekEngine;
  },
  createEngine: createHideSeekEngine,
  controls(mode) {
    return {
      kind: "joystick",
      buttons: [
        mode === "seek" ? { id: "look", label: "Look", key: "Space", tone: "primary" } : { id: "hide", label: "Hide", key: "Space", tone: "primary" },
        { id: "sprint", label: "Run", key: "Shift", tone: "secondary" },
      ],
    };
  },
};

export default hideSeek;
