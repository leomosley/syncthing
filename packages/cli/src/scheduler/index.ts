import type { Scheduler } from "./common";
import { cronScheduler } from "./cron";
import { launchdScheduler } from "./launchd";
import { schtasksScheduler } from "./schtasks";

export const getScheduler = (): Scheduler => {
  switch (process.platform) {
    case "darwin":
      return launchdScheduler;
    case "win32":
      return schtasksScheduler;
    default:
      return cronScheduler;
  }
};

export type { Scheduler } from "./common";
