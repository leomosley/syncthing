import { cancel, confirm, isCancel, log, select } from "@clack/prompts";
import chalk from "chalk";
import { loadConfig, removeDir, saveConfig } from "../config";
import { getScheduler } from "../scheduler";

export const runRemove = async (name?: string): Promise<number> => {
  const config = await loadConfig();

  if (config.dirs.length === 0) {
    log.warn("no directories configured");
    return 0;
  }

  let target = name;

  if (!target) {
    const selected = await select({
      message: "Which directory to stop syncing?",
      options: config.dirs.map((dir) => ({ value: dir.name, label: dir.name, hint: dir.path })),
    });
    if (isCancel(selected) || selected === undefined) {
      cancel("Cancelled");
      return 1;
    }
    target = selected as string;
  }

  const dir = config.dirs.find((entry) => entry.name === target);
  if (!dir) {
    log.error(`no synced directory named "${target}"`);
    return 1;
  }

  const sure = await confirm({
    message: `Stop syncing ${chalk.bold(dir.name)}? Files stay, scheduled task removed.`,
  });
  if (isCancel(sure) || !sure) {
    cancel("Cancelled");
    return 1;
  }

  await getScheduler().unregister(dir.name);
  await saveConfig(removeDir(config, dir.name));
  log.success(`Removed ${dir.name}`);
  return 0;
};
