import { homedir } from "node:os";
import { join } from "node:path";

const appName = "syncthng";

export const configDir = (): string => {
  if (process.platform === "win32") {
    const base = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(base, appName);
  }
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(base, appName);
};

export const configFile = (): string => join(configDir(), "config.json");

export const logDir = (): string => join(configDir(), "logs");

export const logFile = (name: string): string => join(logDir(), `${name}.log`);

// directory holding the hidden-launch vbs scripts used by the Windows scheduler
export const launcherDir = (): string => join(configDir(), "launchers");

export const launcherFile = (taskName: string): string =>
  join(launcherDir(), `${taskName}.vbs`);

// how the scheduler should re-invoke this cli
export const selfInvocation = (): { file: string; prefix: string[] } => ({
  file: process.execPath,
  prefix: [process.argv[1] ?? ""].filter(Boolean),
});
