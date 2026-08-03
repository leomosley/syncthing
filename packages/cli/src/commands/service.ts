import chalk from "chalk";
import { loadConfig } from "../config";
import { getScheduler } from "../scheduler";

export const runServiceRepair = async (): Promise<number> => {
  const config = await loadConfig();
  const scheduler = getScheduler();

  if (config.dirs.length === 0) {
    console.log(chalk.dim("no directories configured"));
    return 0;
  }

  for (const dir of config.dirs) {
    await scheduler.register(dir);
    console.log(`${chalk.green("✓")} re-registered ${dir.name} (${scheduler.name})`);
  }
  return 0;
};

export const runServiceUninstall = async (): Promise<number> => {
  const config = await loadConfig();
  const scheduler = getScheduler();

  for (const dir of config.dirs) {
    await scheduler.unregister(dir.name);
    console.log(`${chalk.yellow("−")} unregistered ${dir.name}`);
  }
  return 0;
};
