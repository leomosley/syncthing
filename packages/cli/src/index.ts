#!/usr/bin/env bun
import { Command } from "commander";
import { runInit } from "./commands/init";
import { runList } from "./commands/list";
import { runRemove } from "./commands/remove";
import { runServiceRepair, runServiceUninstall } from "./commands/service";
import { runStatus } from "./commands/status";
import { runSync } from "./commands/sync";

const program = new Command();

const finish = (code: number): void => process.exit(code);

program
  .name("syncthing")
  .description("Sync a directory using GitHub as file storage and git for change detection.")
  .version("0.1.0");

program
  .command("init")
  .description("Set up a new directory to sync")
  .action(async () => finish(await runInit()));

program
  .command("sync")
  .argument("[name]", "directory to sync; omit to sync all")
  .description("Sync now (used by the scheduler)")
  .action(async (name?: string) => finish(await runSync(name)));

program
  .command("list")
  .alias("ls")
  .description("List configured directories")
  .action(async () => finish(await runList()));

program
  .command("status")
  .description("Show live git state for each directory")
  .action(async () => finish(await runStatus()));

program
  .command("remove")
  .alias("rm")
  .argument("[name]", "directory to stop syncing")
  .description("Stop syncing a directory (files are kept)")
  .action(async (name?: string) => finish(await runRemove(name)));

const service = program.command("service").description("Manage the background scheduler");
service
  .command("repair")
  .description("Re-register all scheduled tasks")
  .action(async () => finish(await runServiceRepair()));
service
  .command("uninstall")
  .description("Remove all scheduled tasks")
  .action(async () => finish(await runServiceUninstall()));

if (process.argv.slice(2).length === 0) {
  program.outputHelp();
  process.exit(0);
}

program.parseAsync().catch((error) => {
  console.error(error);
  process.exit(1);
});
