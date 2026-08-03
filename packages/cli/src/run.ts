import { spawn } from "node:child_process";

export type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type RunOptions = {
  cwd?: string;
  // when true, throws on non-zero exit
  throwOnError?: boolean;
  env?: NodeJS.ProcessEnv;
};

export class RunError extends Error {
  constructor(
    public command: string,
    public result: RunResult
  ) {
    super(`command failed (${result.code}): ${command}\n${result.stderr.trim()}`);
    this.name = "RunError";
  }
}

export const run = (file: string, args: string[], options: RunOptions = {}): Promise<RunResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));

    child.on("error", (error) => reject(error));

    child.on("close", (code) => {
      const result: RunResult = { code: code ?? 0, stdout, stderr };
      if (options.throwOnError && result.code !== 0) {
        reject(new RunError(`${file} ${args.join(" ")}`, result));
        return;
      }
      resolve(result);
    });
  });

export const exists = async (file: string): Promise<boolean> => {
  try {
    const probe = process.platform === "win32" ? "where" : "which";
    const result = await run(probe, [file]);
    return result.code === 0;
  } catch {
    return false;
  }
};
