import { mkdir, rm, writeFile } from "node:fs/promises";
import type { SyncedDir } from "../config";
import { launcherDir, launcherFile, logDir, logFile } from "../paths";
import { run } from "../run";
import { shellCommand, taskId, type Scheduler } from "./common";

const taskName = (name: string): string => `syncthng_${taskId(name)}`;

// Escapes a string for use inside a VBScript double-quoted literal.
const vbsString = (value: string): string => `"${value.replace(/"/g, '""')}"`;

// Builds a tiny VBScript that launches the sync command with a hidden window.
// wscript.exe (a GUI-subsystem host) runs this, so no console window is ever
// created — unlike launching node.exe directly, which flashes a terminal.
const launcherScript = (name: string): string => {
  const command = shellCommand(name);
  const log = logFile(taskId(name));
  // Run via cmd so output is still captured to the log file, window style 0
  // (hidden), and do not wait for completion. The command is wrapped in an
  // extra pair of quotes so cmd's /c quote-stripping leaves it intact.
  const inner = `${command} >> "${log}" 2>&1`;
  const wrapped = `cmd /c "${inner}"`;
  return [
    'Set shell = CreateObject("WScript.Shell")',
    `shell.Run ${vbsString(wrapped)}, 0, False`,
    "",
  ].join("\r\n");
};

export const schtasksScheduler: Scheduler = {
  name: "schtasks",
  register: async (dir: SyncedDir) => {
    await mkdir(logDir(), { recursive: true });
    await mkdir(launcherDir(), { recursive: true });

    const launcher = launcherFile(taskName(dir.name));
    await writeFile(launcher, launcherScript(dir.name), "utf8");

    // wscript.exe has no console window, and the vbs launches the real command
    // hidden, so the scheduled task runs completely in the background.
    const action = `wscript.exe //B //Nologo "${launcher}"`;

    await run(
      "schtasks",
      [
        "/Create",
        "/F",
        "/SC",
        "MINUTE",
        "/MO",
        String(dir.interval),
        "/TN",
        taskName(dir.name),
        "/TR",
        action,
      ],
      { throwOnError: true }
    );
  },
  unregister: async (name: string) => {
    await run("schtasks", ["/Delete", "/F", "/TN", taskName(name)]);
    await rm(launcherFile(taskName(name)), { force: true });
  },
};
