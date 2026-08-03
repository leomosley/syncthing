import { mkdir } from "node:fs/promises";
import type { SyncedDir } from "../config";
import { logDir } from "../paths";
import { run } from "../run";
import { shellCommand, taskId, type Scheduler } from "./common";

const taskName = (name: string): string => `syncthing_${taskId(name)}`;

export const schtasksScheduler: Scheduler = {
  name: "schtasks",
  register: async (dir: SyncedDir) => {
    await mkdir(logDir(), { recursive: true });
    await run(
      "schtasks",
      [
        "/Create",
        "/F",
        "/SC",
        "MINUTE",
        "/MO",
        String(dir.interval),
        "/TN",
        taskName(dir.name),
        "/TR",
        shellCommand(dir.name),
      ],
      { throwOnError: true }
    );
  },
  unregister: async (name: string) => {
    await run("schtasks", ["/Delete", "/F", "/TN", taskName(name)]);
  },
};
