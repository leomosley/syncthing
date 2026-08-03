import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { configFile } from "./paths";

export const syncedDirSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  remote: z.string().min(1),
  branch: z.string().min(1).default("main"),
  interval: z.number().int().positive(),
  lastSync: z.string().optional(),
});

export type SyncedDir = z.infer<typeof syncedDirSchema>;

export const configSchema = z.object({
  version: z.literal(1).default(1),
  dirs: z.array(syncedDirSchema).default([]),
});

export type Config = z.infer<typeof configSchema>;

const emptyConfig: Config = { version: 1, dirs: [] };

export const loadConfig = async (): Promise<Config> => {
  try {
    const raw = await readFile(configFile(), "utf8");
    return configSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...emptyConfig };
    throw error;
  }
};

export const saveConfig = async (config: Config): Promise<void> => {
  const path = configFile();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
};

export const findDir = (config: Config, name: string): SyncedDir | undefined =>
  config.dirs.find((dir) => dir.name === name);

export const upsertDir = (config: Config, dir: SyncedDir): Config => ({
  ...config,
  dirs: [...config.dirs.filter((existing) => existing.name !== dir.name), dir],
});

export const removeDir = (config: Config, name: string): Config => ({
  ...config,
  dirs: config.dirs.filter((dir) => dir.name !== name),
});
