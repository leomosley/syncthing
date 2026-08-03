import { exists, run } from "./run";

export const ghAvailable = (): Promise<boolean> => exists("gh");

export const ghAuthed = async (): Promise<boolean> => {
  const result = await run("gh", ["auth", "status"]);
  return result.code === 0;
};

export const ghUser = async (): Promise<string | undefined> => {
  const result = await run("gh", ["api", "user", "-q", ".login"]);
  if (result.code !== 0) return undefined;
  return result.stdout.trim() || undefined;
};

export const repoExists = async (owner: string, name: string): Promise<boolean> => {
  const result = await run("gh", ["repo", "view", `${owner}/${name}`]);
  return result.code === 0;
};

// creates a private repo from an existing local dir, wires origin, pushes current branch
export const createRepo = async (name: string, cwd: string): Promise<void> => {
  await run(
    "gh",
    ["repo", "create", name, "--private", "--source", cwd, "--remote", "origin", "--push"],
    { cwd, throwOnError: true }
  );
};
