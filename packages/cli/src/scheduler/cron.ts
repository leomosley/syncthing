import { mkdir } from "node:fs/promises";
import type { SyncedDir } from "../config";
import { logDir, logFile } from "../paths";
import { run } from "../run";
import { cronExpression, shellCommand, taskId, type Scheduler } from "./common";

const marker = (name: string): string => `# syncthng:${name}`;

const readCrontab = async (): Promise<string[]> => {
  const result = await run("crontab", ["-l"]);
  if (result.code !== 0) return [];
  return result.stdout.split("\n");
};

const writeCrontab = async (lines: string[]): Promise<void> => {
  const content = `${lines.filter((line) => line.length > 0).join("\n")}\n`;
  const { spawn } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("crontab", ["-"], {
      stdio: ["pipe", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`crontab failed: ${stderr}`))
    );
    child.stdin.write(content);
    child.stdin.end();
  });
};

const withoutEntry = (lines: string[], name: string): string[] =>
  lines.filter((line) => !line.trimEnd().endsWith(marker(name)));

export const cronScheduler: Scheduler = {
  name: "cron",
  register: async (dir: SyncedDir) => {
    await mkdir(logDir(), { recursive: true });
    const lines = withoutEntry(await readCrontab(), dir.name);
    const log = logFile(taskId(dir.name));
    const entry = `${cronExpression(dir.interval)} ${shellCommand(dir.name)} >> "${log}" 2>&1 ${marker(dir.name)}`;
    await writeCrontab([...lines, entry]);
  },
  unregister: async (name: string) => {
    const lines = withoutEntry(await readCrontab(), name);
    await writeCrontab(lines);
  },
};
