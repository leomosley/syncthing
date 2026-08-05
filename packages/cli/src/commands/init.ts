import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  cancel,
  confirm,
  intro,
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

type Visibility = "private" | "public";

const bail = (): never => {
  cancel("Cancelled");
  process.exit(1);
};

const unwrap = <T>(value: T | symbol | undefined): T => {
  if (typeof value === "symbol" || value === undefined) bail();
  return value as T;
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

const intervalLabel = (minutes: number): string =>
  intervalOptions.find((option) => option.value === minutes)?.label ?? `${minutes}m`;

// sentinel values that cannot collide with absolute paths
const USE = "\u0000use";
const UP = "\u0000up";
const NEW = "\u0000new";

const listSubdirs = (dir: string): string[] => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => name !== ".git")
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
};

const pickDirectory = async (start: string): Promise<string> => {
  let current = resolve(start);

  for (;;) {
    const parent = dirname(current);
    const subdirs = listSubdirs(current);

    const options = [
      { value: USE, label: chalk.green("Use this directory"), hint: current },
      { value: NEW, label: "Create a new folder here" },
      ...(parent !== current ? [{ value: UP, label: "..", hint: "parent" }] : []),
      ...subdirs.map((name) => ({ value: join(current, name), label: `${name}/` })),
    ];

    const choice = unwrap<string>(
      await select({ message: `Browse: ${chalk.dim(current)}`, options, maxItems: 12 })
    );

    if (choice === USE) return current;
    if (choice === UP) {
      current = parent;
      continue;
    }
    if (choice === NEW) {
      const folder = unwrap<string>(
        await text({
          message: "New folder name",
          validate: (value) => (!value?.trim() ? "Required" : undefined),
        })
      );
      current = join(current, folder.trim());
      await mkdir(current, { recursive: true });
      continue;
    }
    current = choice;
  }
};

export const runInit = async (): Promise<number> => {
  intro(chalk.bold("syncthng"));

  if (!(await ghAvailable())) {
    log.error("GitHub CLI (gh) not found. Install it: https://cli.github.com");
    return 1;
  }
  if (!(await ghAuthed())) {
    log.error("Not authenticated with GitHub. Run `gh auth login` first.");
    return 1;
  }

  const login = await ghUser();
  const config = await loadConfig();

  // directory
  const dirPath = await pickDirectory(process.cwd());
  if (config.dirs.some((dir) => dir.path === dirPath)) {
    log.error(`${dirPath} is already synced`);
    return 1;
  }

  const alreadyRepo = await git.isRepo(dirPath);

  // owner
  const owner = unwrap<string>(
    await text({
      message: "GitHub owner (user or org)",
      defaultValue: login ?? "",
      placeholder: login ?? "your-username",
      validate: (value) => (!value?.trim() ? "Required" : undefined),
    })
  ).trim();

  // repo name
  const name = unwrap<string>(
    await text({
      message: "Repository name",
      defaultValue: basename(dirPath),
      placeholder: basename(dirPath),
      validate: (value) =>
        value && /^[a-zA-Z0-9._-]+$/.test(value.trim()) ? undefined : "Use letters, numbers, . _ -",
    })
  ).trim();

  if (config.dirs.some((dir) => dir.name === name)) {
    log.error(`a synced dir named "${name}" already exists`);
    return 1;
  }
  if (await repoExists(owner, name)) {
    log.error(`repo ${owner}/${name} already exists on GitHub`);
    return 1;
  }

  // visibility
  const visibility = unwrap<Visibility>(
    await select({
      message: "Repository visibility",
      options: [
        { value: "private", label: "Private" },
        { value: "public", label: "Public" },
      ],
    })
  );

  // interval
  const interval = unwrap<number>(
    await select({ message: "Sync interval", options: intervalOptions })
  );

  // gitignore
  const gitignorePath = join(dirPath, ".gitignore");
  let writeIgnore = true;
  if (existsSync(gitignorePath)) {
    writeIgnore = unwrap<boolean>(
      await confirm({
        message: ".gitignore exists. Replace it with a generated one?",
        initialValue: false,
      })
    );
  }

  let gitignore = "";
  let ignoreSummary = "kept existing";
  if (writeIgnore) {
    const groups = unwrap<string[]>(
      await multiselect({
        message: "What should git ignore? (space to toggle)",
        options: ignoreGroups.map((group) => ({
          value: group.id,
          label: group.label,
          hint: group.hint,
        })),
        initialValues: ["os", "env"],
        required: false,
      })
    );

    const customInput = unwrap<string>(
      await text({
        message: "Extra patterns (comma separated, e.g. .env*, secrets/)",
        placeholder: "leave blank for none",
        defaultValue: "",
      })
    );
    const custom = customInput.split(/[\n,]/).map((line) => line.trim());

    gitignore = buildGitignore(groups, custom);
    const customCount = custom.filter(Boolean).length;
    ignoreSummary = `${groups.length} group(s)${customCount > 0 ? `, ${customCount} custom` : ""}`;
  }

  const branch = alreadyRepo ? await git.currentBranch(dirPath) : "main";
  const slug = `${owner}/${name}`;

  // review
  note(
    [
      `${chalk.dim("Directory")}   ${dirPath}`,
      `${chalk.dim("Repository")}  ${slug} ${chalk.dim(`(${visibility})`)}`,
      `${chalk.dim("Branch")}      ${branch}`,
      `${chalk.dim("Interval")}    ${intervalLabel(interval)}`,
      `${chalk.dim("Ignore")}      ${ignoreSummary}`,
    ].join("\n"),
    "Review"
  );

  const proceed = unwrap<boolean>(
    await confirm({ message: `Create ${chalk.bold(slug)} and start syncing?` })
  );
  if (!proceed) bail();

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
      s.message(`Creating ${visibility} GitHub repo`);
      await createRepo(slug, dirPath, visibility);
    }

    const remote = (await git.getRemoteUrl(dirPath, "origin")) ?? "origin";

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
    s.stop(`Synced ${chalk.bold(name)} via ${scheduler.name}`);
  } catch (error) {
    s.stop(chalk.red("Setup failed"));
    log.error((error as Error).message);
    return 1;
  }

  outro(
    `${chalk.green("Done.")} ${intervalLabel(interval).toLowerCase()}. ${chalk.dim("syncthng list")} to view.`
  );
  return 0;
};
