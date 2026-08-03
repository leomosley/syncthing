import { run, type RunResult } from "./run";

const git = (args: string[], cwd: string): Promise<RunResult> =>
  run("git", args, { cwd, throwOnError: true });

const gitSoft = (args: string[], cwd: string): Promise<RunResult> => run("git", args, { cwd });

export const isRepo = async (cwd: string): Promise<boolean> => {
  const result = await gitSoft(["rev-parse", "--is-inside-work-tree"], cwd);
  return result.code === 0 && result.stdout.trim() === "true";
};

export const init = async (cwd: string, branch: string): Promise<void> => {
  await git(["init", "-b", branch], cwd);
};

export const currentBranch = async (cwd: string): Promise<string> => {
  const result = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  return result.stdout.trim();
};

export const hasCommits = async (cwd: string): Promise<boolean> => {
  const result = await gitSoft(["rev-parse", "--verify", "HEAD"], cwd);
  return result.code === 0;
};

export const isDirty = async (cwd: string): Promise<boolean> => {
  const result = await git(["status", "--porcelain"], cwd);
  return result.stdout.trim().length > 0;
};

export const stageAll = async (cwd: string): Promise<void> => {
  await git(["add", "-A"], cwd);
};

export const commit = async (cwd: string, message: string): Promise<void> => {
  await git(["commit", "-m", message], cwd);
};

export const fetch = async (cwd: string, remote: string, _branch: string): Promise<void> => {
  await git(["fetch", remote], cwd);
};

// returns undefined when the remote branch does not exist yet
export const remoteBranchExists = async (
  cwd: string,
  remote: string,
  branch: string
): Promise<boolean> => {
  const result = await gitSoft(["rev-parse", "--verify", `${remote}/${branch}`], cwd);
  return result.code === 0;
};

export type AheadBehind = { ahead: number; behind: number };

export const aheadBehind = async (
  cwd: string,
  remote: string,
  branch: string
): Promise<AheadBehind> => {
  const result = await git(
    ["rev-list", "--left-right", "--count", `HEAD...${remote}/${branch}`],
    cwd
  );
  const [ahead, behind] = result.stdout.trim().split(/\s+/).map(Number);
  return { ahead: ahead ?? 0, behind: behind ?? 0 };
};

export const pullFastForward = async (
  cwd: string,
  remote: string,
  branch: string
): Promise<void> => {
  await git(["merge", "--ff-only", `${remote}/${branch}`], cwd);
};

// returns false when the rebase hit a conflict (and was aborted)
export const pullRebase = async (cwd: string, remote: string, branch: string): Promise<boolean> => {
  const result = await gitSoft(["rebase", `${remote}/${branch}`], cwd);
  if (result.code !== 0) {
    await gitSoft(["rebase", "--abort"], cwd);
    return false;
  }
  return true;
};

export const push = async (
  cwd: string,
  remote: string,
  branch: string,
  setUpstream: boolean
): Promise<void> => {
  const args = ["push", ...(setUpstream ? ["-u"] : []), remote, branch];
  await git(args, cwd);
};

export const getRemoteUrl = async (cwd: string, remote: string): Promise<string | undefined> => {
  const result = await gitSoft(["remote", "get-url", remote], cwd);
  if (result.code !== 0) return undefined;
  return result.stdout.trim() || undefined;
};

export const setRemote = async (cwd: string, remote: string, url: string): Promise<void> => {
  const existing = await gitSoft(["remote", "get-url", remote], cwd);
  if (existing.code === 0) {
    await git(["remote", "set-url", remote, url], cwd);
    return;
  }
  await git(["remote", "add", remote, url], cwd);
};
