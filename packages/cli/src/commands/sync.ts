import chalk from "chalk";
import { loadConfig, saveConfig, upsertDir, findDir } from "../config";
import { syncDir, type SyncResult } from "../sync";

const symbol = (result: SyncResult): string => {
  switch (result.action) {
    case "noop":
      return chalk.dim("=");
    case "pushed":
      return chalk.green("↑");
    case "pulled":
      return chalk.blue("↓");
    case "synced":
      return chalk.cyan("⇅");
    case "diverged":
      return chalk.yellow("⚠");
    case "error":
      return chalk.red("✗");
  }
};

const line = (result: SyncResult): string => {
  const detail = result.detail ? chalk.dim(` ${result.detail}`) : "";
  return `${symbol(result)} ${result.name} ${chalk.dim(result.action)}${detail}`;
};

export const runSync = async (name?: string): Promise<number> => {
  let config = await loadConfig();

  const targets = name ? [findDir(config, name)].filter((dir) => dir !== undefined) : config.dirs;

  if (name && targets.length === 0) {
    console.error(chalk.red(`no synced directory named "${name}"`));
    return 1;
  }

  if (targets.length === 0) {
    console.log(chalk.dim("no directories configured"));
    return 0;
  }

  let hadError = false;

  for (const dir of targets) {
    const result = await syncDir(dir);
    console.log(line(result));
    if (result.action === "error" || result.action === "diverged") hadError = true;
    if (result.action !== "error") {
      config = upsertDir(config, { ...dir, lastSync: new Date().toISOString() });
    }
  }

  await saveConfig(config);
  return hadError ? 1 : 0;
};
