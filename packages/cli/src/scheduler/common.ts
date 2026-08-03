import { selfInvocation } from "../paths";
import type { SyncedDir } from "../config";

export const taskId = (name: string): string => name.replace(/[^a-zA-Z0-9-_]/g, "_");

// argv for invoking `syncthng sync <name>`, split into binary + args
export const invocation = (name: string): { file: string; args: string[] } => {
  const { file, prefix } = selfInvocation();
  return { file, args: [...prefix, "sync", name] };
};

export const shellCommand = (name: string): string => {
  const { file, args } = invocation(name);
  return [file, ...args].map((part) => `"${part}"`).join(" ");
};

export const cronExpression = (intervalMinutes: number): string => {
  if (intervalMinutes < 60) return `*/${intervalMinutes} * * * *`;
  if (intervalMinutes % 60 === 0) {
    const hours = intervalMinutes / 60;
    if (hours < 24) return `0 */${hours} * * *`;
    if (intervalMinutes % 1440 === 0) return `0 0 */${intervalMinutes / 1440} * *`;
  }
  return "*/30 * * * *";
};

export type Scheduler = {
  name: string;
  register: (dir: SyncedDir) => Promise<void>;
  unregister: (name: string) => Promise<void>;
};
