import chalk from "chalk";
import { loadConfig } from "../config";
import * as git from "../git";

export const runStatus = async (): Promise<number> => {
  const config = await loadConfig();

  if (config.dirs.length === 0) {
    console.log(chalk.dim("no directories configured"));
    return 0;
  }

  for (const dir of config.dirs) {
    try {
      if (!(await git.isRepo(dir.path))) {
        console.log(`${chalk.red("✗")} ${dir.name} ${chalk.dim("not a git repo")}`);
        continue;
      }
      const dirty = await git.isDirty(dir.path);
      await git.fetch(dir.path, "origin", dir.branch);
      const remoteReady = await git.remoteBranchExists(dir.path, "origin", dir.branch);
      const { ahead, behind } = remoteReady
        ? await git.aheadBehind(dir.path, "origin", dir.branch)
        : { ahead: 0, behind: 0 };

      const parts = [
        dirty ? chalk.yellow("uncommitted") : "",
        ahead > 0 ? chalk.green(`↑${ahead}`) : "",
        behind > 0 ? chalk.blue(`↓${behind}`) : "",
      ].filter(Boolean);
      const state = parts.length > 0 ? parts.join(" ") : chalk.dim("clean");
      console.log(`${chalk.bold(dir.name)} ${state}`);
    } catch (error) {
      console.log(`${chalk.red("✗")} ${dir.name} ${chalk.dim((error as Error).message)}`);
    }
  }
  return 0;
};
