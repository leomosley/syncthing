import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  multiselect,
  note,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts";
import chalk from "chalk";
import { loadConfig, saveConfig, upsertDir, type SyncedDir } from "../config";
import * as git from "../git";
import { createRepo, ghAuthed, ghAvailable, ghUser, repoExists } from "../gh";
import { buildGitignore, ignoreGroups } from "../gitignore";
import { getScheduler } from "../scheduler";

const bail = (): never => {
  cancel("Cancelled");
  process.exit(1);
};

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

export const runInit = async (): Promise<number> => {
  intro(chalk.bold("syncthing"));

  if (!(await ghAvailable())) {
    log.error("GitHub CLI (gh) not found. Install it: https://cli.github.com");
    return 1;
  }
  if (!(await ghAuthed())) {
    log.error("Not authenticated with GitHub. Run `gh auth login` first.");
    return 1;
  }

  const owner = await ghUser();

  const config = await loadConfig();

  // directory
  const dirInput = await text({
    message: "Directory to sync",
    placeholder: process.cwd(),
    defaultValue: process.cwd(),
    validate: (value) => (value.trim().length === 0 ? "Required" : undefined),
  });
  if (isCancel(dirInput)) bail();
  const dirPath = resolve(dirInput as string);

  if (config.dirs.some((dir) => dir.path === dirPath)) {
    log.error(`${dirPath} is already synced`);
    return 1;
  }

  if (!existsSync(dirPath)) {
    const create = await confirm({ message: `${dirPath} does not exist. Create it?` });
    if (isCancel(create) || !create) bail();
    await mkdir(dirPath, { recursive: true });
  }

  const alreadyRepo = await git.isRepo(dirPath);

  // repo name
  const nameInput = await text({
    message: "Private repo name",
    defaultValue: basename(dirPath),
    placeholder: basename(dirPath),
    validate: (value) =>
      /^[a-zA-Z0-9._-]+$/.test(value.trim()) ? undefined : "Use letters, numbers, . _ -",
  });
  if (isCancel(nameInput)) bail();
  const name = (nameInput as string).trim();

  if (config.dirs.some((dir) => dir.name === name)) {
    log.error(`a synced dir named "${name}" already exists`);
    return 1;
  }
  if (owner && (await repoExists(owner, name))) {
    log.error(`repo ${owner}/${name} already exists on GitHub`);
    return 1;
  }

  // interval
  const interval = await select({ message: "Sync interval", options: intervalOptions });
  if (isCancel(interval)) bail();

  // gitignore
  const gitignorePath = join(dirPath, ".gitignore");
  let writeIgnore = true;
  if (existsSync(gitignorePath)) {
    const overwrite = await confirm({
      message: ".gitignore exists. Replace it with a generated one?",
      initialValue: false,
    });
    if (isCancel(overwrite)) bail();
    writeIgnore = overwrite as boolean;
  }

  let gitignore = "";
  if (writeIgnore) {
    const groups = await multiselect({
      message: "What should git ignore? (space to toggle)",
      options: ignoreGroups.map((group) => ({
        value: group.id,
        label: group.label,
        hint: group.hint,
      })),
      initialValues: ["os", "env"],
      required: false,
    });
    if (isCancel(groups)) bail();

    const customInput = await text({
      message: "Extra patterns (comma separated, e.g. .env*, secrets/)",
      placeholder: "leave blank for none",
      defaultValue: "",
    });
    if (isCancel(customInput)) bail();
    const custom = (customInput as string).split(/[\n,]/).map((line) => line.trim());

    gitignore = buildGitignore(groups as string[], custom);
    note(gitignore.trim(), ".gitignore preview");
  }

  const branch = alreadyRepo ? await git.currentBranch(dirPath) : "main";

  // execute
  const s = spinner();
  try {
    s.start("Setting up repository");

    if (!alreadyRepo) await git.init(dirPath, branch);
    if (writeIgnore) await writeFile(gitignorePath, gitignore, "utf8");

    if (!(await git.hasCommits(dirPath)) || (await git.isDirty(dirPath))) {
      await git.stageAll(dirPath);
      await git.commit(dirPath, "initial sync");
    }

    const existingRemote = await git.getRemoteUrl(dirPath, "origin");
    if (existingRemote) {
      s.message("Pushing to existing origin");
      await git.push(dirPath, "origin", branch, true);
    } else {
      s.message("Creating private GitHub repo");
      await createRepo(name, dirPath);
    }

    const remote = (await git.getRemoteUrl(dirPath, "origin")) ?? "origin";

    const dir: SyncedDir = {
      name,
      path: dirPath,
      remote,
      branch,
      interval: interval as number,
      lastSync: new Date().toISOString(),
    };

    s.message("Scheduling background sync");
    const scheduler = getScheduler();
    await scheduler.register(dir);

    await saveConfig(upsertDir(config, dir));
    s.stop(`Synced ${chalk.bold(name)} via ${scheduler.name}`);
  } catch (error) {
    s.stop(chalk.red("Setup failed"));
    log.error((error as Error).message);
    return 1;
  }

  outro(
    `${chalk.green("Done.")} ${chalk.dim("syncthing list")} to view, syncing every ${interval as number}m.`
  );
  return 0;
};
