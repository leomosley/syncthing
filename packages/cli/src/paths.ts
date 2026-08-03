import { homedir } from "node:os";
import { join } from "node:path";

const appName = "syncthing";

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

// how the scheduler should re-invoke this cli
export const selfInvocation = (): { file: string; prefix: string[] } => ({
  file: process.execPath,
  prefix: [process.argv[1] ?? ""].filter(Boolean),
});
