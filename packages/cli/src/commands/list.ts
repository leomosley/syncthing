import chalk from "chalk";
import { loadConfig } from "../config";
import { isDue } from "../sync";

const formatInterval = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`;
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
};

const formatLast = (lastSync?: string): string => {
  if (!lastSync) return chalk.dim("never");
  return new Date(lastSync).toLocaleString();
};

export const runList = async (): Promise<number> => {
  const config = await loadConfig();

  if (config.dirs.length === 0) {
    console.log(chalk.dim("no directories configured. run `syncthng init`"));
    return 0;
  }

  for (const dir of config.dirs) {
    const due = isDue(dir) ? chalk.yellow(" due") : "";
    console.log(chalk.bold(dir.name) + due);
    console.log(`  ${chalk.dim("path")}     ${dir.path}`);
    console.log(`  ${chalk.dim("remote")}   ${dir.remote}`);
    console.log(`  ${chalk.dim("branch")}   ${dir.branch}`);
    console.log(`  ${chalk.dim("interval")} ${formatInterval(dir.interval)}`);
    console.log(`  ${chalk.dim("last")}     ${formatLast(dir.lastSync)}`);
    console.log("");
  }

  return 0;
};
