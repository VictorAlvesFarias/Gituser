import { join } from 'node:path';
import { runPowerShellScript } from './exec.ts';
import { paths } from './paths.ts';

export interface StoredCredential {
  target: string;
  protocol: string;
  host: string;
  username: string;
}

export const canListStoredCredentials = process.platform === 'win32';

/** Reads git credentials saved in Windows Credential Manager (as written by Git Credential Manager). */
export async function listStoredCredentials(): Promise<StoredCredential[]> {
  if (!canListStoredCredentials) return [];
  const output = await runPowerShellScript(join(paths.scriptsDir, 'list-credentials.ps1'));
  const entries = JSON.parse(output || '[]') as { target: string; username: string }[];
  return entries.flatMap((entry) => {
    try {
      // Targets look like "git:https://github.com" or "git:https://user@github.com".
      const url = new URL(entry.target.replace(/^git:/, ''));
      return [
        {
          target: entry.target,
          protocol: url.protocol.replace(/:$/, ''),
          host: url.host,
          username: entry.username || decodeURIComponent(url.username),
        },
      ];
    } catch {
      return [];
    }
  });
}
