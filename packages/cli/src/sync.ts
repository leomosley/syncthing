import { hostname } from "node:os";
import type { SyncedDir } from "./config";
import * as git from "./git";

export type SyncAction = "noop" | "pushed" | "pulled" | "synced" | "diverged" | "error";

export type SyncResult = {
  name: string;
  action: SyncAction;
  detail?: string;
};

const commitMessage = (): string => `sync: ${new Date().toISOString()} on ${hostname()}`;

// true when the dir is due based on its interval and last sync time
export const isDue = (dir: SyncedDir, now: Date = new Date()): boolean => {
  if (!dir.lastSync) return true;
  const last = new Date(dir.lastSync).getTime();
  const elapsedMinutes = (now.getTime() - last) / 60_000;
  return elapsedMinutes >= dir.interval;
};

export const syncDir = async (dir: SyncedDir): Promise<SyncResult> => {
  const cwd = dir.path;
  const remote = "origin";
  const branch = dir.branch;

  try {
    if (!(await git.isRepo(cwd))) {
      return { name: dir.name, action: "error", detail: "not a git repository" };
    }

    // commit any local changes before comparing with the remote
    if (await git.isDirty(cwd)) {
      await git.stageAll(cwd);
      await git.commit(cwd, commitMessage());
    }

    await git.fetch(cwd, remote, branch);

    if (!(await git.remoteBranchExists(cwd, remote, branch))) {
      await git.push(cwd, remote, branch, true);
      return { name: dir.name, action: "pushed", detail: "created remote branch" };
    }

    const { ahead, behind } = await git.aheadBehind(cwd, remote, branch);

    if (ahead === 0 && behind === 0) return { name: dir.name, action: "noop" };

    if (behind > 0 && ahead === 0) {
      await git.pullFastForward(cwd, remote, branch);
      return { name: dir.name, action: "pulled", detail: `${behind} commit(s)` };
    }

    if (ahead > 0 && behind === 0) {
      await git.push(cwd, remote, branch, false);
      return { name: dir.name, action: "pushed", detail: `${ahead} commit(s)` };
    }

    // diverged: user works one machine at a time, so this is rare.
    // try to rebase local work on top of remote, then push. abort on conflict.
    const rebased = await git.pullRebase(cwd, remote, branch);
    if (!rebased) {
      return {
        name: dir.name,
        action: "diverged",
        detail: "rebase conflict, manual resolution required",
      };
    }
    await git.push(cwd, remote, branch, false);
    return { name: dir.name, action: "synced", detail: `+${ahead} / -${behind}` };
  } catch (error) {
    return { name: dir.name, action: "error", detail: (error as Error).message };
  }
};
