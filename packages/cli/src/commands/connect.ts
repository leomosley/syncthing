import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { cancel, confirm, intro, log, note, outro, select, spinner, text } from "@clack/prompts";
import chalk from "chalk";
import { loadConfig, saveConfig, upsertDir, type SyncedDir } from "../config";
import * as git from "../git";
import { cloneRepo, ghAuthed, ghAvailable, repoExists } from "../gh";
import { getScheduler } from "../scheduler";

const intervalOptions = [
  { value: 5, label: "Every 5 minutes" },
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every hour" },
  { value: 120, label: "Every 2 hours" },
  { value: 360, label: "Every 6 hours" },
  { value: 720, label: "Every 12 hours" },
  { value: 1440, label: "Once a day" },
];

const bail = (): never => {
  cancel("Cancelled");
  process.exit(1);
};

const unwrap = <T>(value: T | symbol | undefined): T => {
  if (typeof value === "symbol" || value === undefined) bail();
  return value as T;
};

const normalizeSlug = (value: string): string =>
  value
    .trim()
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\.git$/, "");

export const runConnect = async (repository?: string, destination?: string): Promise<number> => {
  intro(chalk.bold("syncthng connect"));

  if (!(await ghAvailable())) {
    log.error("GitHub CLI (gh) not found. Install it: https://cli.github.com");
    return 1;
  }
  if (!(await ghAuthed())) {
    log.error("Not authenticated with GitHub. Run `gh auth login` first.");
    return 1;
  }

  const slug = normalizeSlug(
    repository ??
      unwrap<string>(
        await text({
          message: "Existing GitHub repository",
          placeholder: "owner/repository",
          validate: (value) =>
            value && /^[^/\s]+\/[^/\s]+$/.test(normalizeSlug(value))
              ? undefined
              : "Use owner/repository",
        })
      )
  );

  if (!/^[^/\s]+\/[^/\s]+$/.test(slug)) {
    log.error("repository must use owner/repository format");
    return 1;
  }
  const [owner, name] = slug.split("/") as [string, string];
  if (!(await repoExists(owner, name))) {
    log.error(`repo ${slug} does not exist or is not accessible`);
    return 1;
  }

  const dirPath = resolve(
    destination ??
      unwrap<string>(
        await text({
          message: "Local directory",
          defaultValue: resolve(process.cwd(), name),
          validate: (value) => (!value?.trim() ? "Required" : undefined),
        })
      )
  );
  const config = await loadConfig();

  if (existsSync(dirPath)) {
    log.error(`${dirPath} already exists; choose a new directory`);
    return 1;
  }
  if (config.dirs.some((dir) => dir.path === dirPath)) {
    log.error(`${dirPath} is already synced`);
    return 1;
  }
  if (config.dirs.some((dir) => dir.name === name)) {
    log.error(`a synced dir named "${name}" already exists`);
    return 1;
  }

  const interval = unwrap<number>(
    await select({ message: "Sync interval", options: intervalOptions })
  );

  note(
    [
      `${chalk.dim("Repository")}  ${slug}`,
      `${chalk.dim("Directory")}   ${dirPath}`,
      `${chalk.dim("Name")}        ${basename(dirPath)}`,
      `${chalk.dim("Interval")}    ${intervalOptions.find((option) => option.value === interval)?.label}`,
    ].join("\n"),
    "Review"
  );

  const proceed = unwrap<boolean>(
    await confirm({ message: `Connect to ${chalk.bold(slug)} and start syncing?` })
  );
  if (!proceed) bail();

  const s = spinner();
  try {
    s.start(`Cloning ${slug}`);
    await cloneRepo(slug, dirPath);
    const branch = await git.currentBranch(dirPath);
    const remote = (await git.getRemoteUrl(dirPath, "origin")) ?? `https://github.com/${slug}.git`;
    const dir: SyncedDir = {
      name,
      path: dirPath,
      remote,
      branch,
      interval,
      lastSync: new Date().toISOString(),
    };

    s.message("Scheduling background sync");
    const scheduler = getScheduler();
    await scheduler.register(dir);
    await saveConfig(upsertDir(config, dir));
    s.stop(`Connected ${chalk.bold(name)} via ${scheduler.name}`);
  } catch (error) {
    s.stop(chalk.red("Connection failed"));
    log.error((error as Error).message);
    return 1;
  }

  outro(`${chalk.green("Done.")} Existing files are now synced to ${chalk.dim(dirPath)}.`);
  return 0;
};
