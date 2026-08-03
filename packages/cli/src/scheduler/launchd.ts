import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SyncedDir } from "../config";
import { logDir, logFile } from "../paths";
import { run } from "../run";
import { invocation, taskId, type Scheduler } from "./common";

const label = (name: string): string => `com.syncthng.${taskId(name)}`;

const plistPath = (name: string): string =>
  join(homedir(), "Library", "LaunchAgents", `${label(name)}.plist`);

const escapeXml = (value: string): string =>
  value.replace(/[<>&'"]/g, (char) => {
    const map: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return map[char] ?? char;
  });

const buildPlist = (dir: SyncedDir): string => {
  const { file, args } = invocation(dir.name);
  const programArgs = [file, ...args]
    .map((part) => `    <string>${escapeXml(part)}</string>`)
    .join("\n");
  const log = logFile(taskId(dir.name));

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label(dir.name)}</string>
  <key>ProgramArguments</key>
  <array>
${programArgs}
  </array>
  <key>StartInterval</key>
  <integer>${dir.interval * 60}</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${escapeXml(log)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(log)}</string>
</dict>
</plist>
`;
};

export const launchdScheduler: Scheduler = {
  name: "launchd",
  register: async (dir) => {
    await mkdir(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
    await mkdir(logDir(), { recursive: true });
    const path = plistPath(dir.name);
    await run("launchctl", ["unload", path]);
    await writeFile(path, buildPlist(dir), "utf8");
    await run("launchctl", ["load", "-w", path], { throwOnError: true });
  },
  unregister: async (name) => {
    const path = plistPath(name);
    await run("launchctl", ["unload", path]);
    await rm(path, { force: true });
  },
};
