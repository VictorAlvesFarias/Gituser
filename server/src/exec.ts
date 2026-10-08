import { spawn } from 'node:child_process';

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  input?: string;
  env?: NodeJS.ProcessEnv;
  /** Kills the process when aborted. */
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Set to false for commands that may need to show their own UI. */
  windowsHide?: boolean;
}

export function exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...options.env },
      windowsHide: options.windowsHide ?? true,
      signal: options.signal,
      timeout: options.timeoutMs,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
    child.stdin.end(options.input ?? '');
  });
}

export async function execOrThrow(command: string, args: string[], options: ExecOptions = {}): Promise<string> {
  const result = await exec(command, args, options);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `${command} exited with code ${result.code}`);
  }
  return result.stdout;
}

export function runPowerShellScript(scriptPath: string, args: string[] = [], input?: string): Promise<string> {
  return execOrThrow(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args],
    { input },
  );
}
