import { exec, execOrThrow } from './exec.ts';

export interface CredentialQuery {
  protocol: string;
  host: string;
  username?: string;
}

export interface Credential extends CredentialQuery {
  username: string;
  password: string;
}

// Never let git or the credential helper open a prompt (terminal, GUI or an editor's askpass).
const nonInteractiveEnv: NodeJS.ProcessEnv = {
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
  GIT_ASKPASS: '',
  SSH_ASKPASS: '',
};

function git(args: string[], input?: string) {
  return exec('git', args, { input, env: nonInteractiveEnv });
}

export async function getGlobal(key: string): Promise<string | null> {
  const result = await git(['config', '--global', '--get', key]);
  return result.code === 0 ? result.stdout.trim() : null;
}

export async function setGlobal(key: string, value: string): Promise<void> {
  await execOrThrow('git', ['config', '--global', key, value]);
}

export async function getCredentialHelpers(): Promise<string[]> {
  const result = await git(['config', '--get-all', 'credential.helper']);
  if (result.code !== 0) return [];
  const values = result.stdout.replace(/\r?\n$/, '').split(/\r?\n/).map((line) => line.trim());
  // An empty value resets the list, exactly like git does when resolving helpers.
  return values.slice(values.lastIndexOf('') + 1);
}

/** Map of credential URL (e.g. "https://github.com") to the username pinned in global config. */
export async function getPinnedUsernames(): Promise<Record<string, string>> {
  const result = await git(['config', '--global', '--get-regexp', '^credential\\..+\\.username$']);
  const pinned: Record<string, string> = {};
  if (result.code !== 0) return pinned;
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^credential\.(.+)\.username\s+(.*)$/.exec(line.trim());
    if (match) pinned[match[1]] = match[2];
  }
  return pinned;
}

function serializeCredential(fields: Record<string, string | undefined>): string {
  return (
    Object.entries(fields)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n\n'
  );
}

export async function credentialFill(query: CredentialQuery): Promise<Credential> {
  const result = await git(['credential', 'fill'], serializeCredential({ ...query }));
  if (result.code !== 0) {
    const who = query.username ? `${query.username}@${query.host}` : query.host;
    throw Object.assign(new Error(`Nenhuma credencial encontrada para ${who}`), { status: 404 });
  }
  const fields: Record<string, string> = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index > 0) fields[line.slice(0, index)] = line.slice(index + 1);
  }
  return {
    protocol: fields.protocol ?? query.protocol,
    host: fields.host ?? query.host,
    username: fields.username ?? '',
    password: fields.password ?? '',
  };
}

export async function credentialApprove(credential: Credential): Promise<void> {
  await execOrThrow('git', ['credential', 'approve'], {
    input: serializeCredential({ ...credential }),
    env: nonInteractiveEnv,
  });
}

export async function credentialReject(query: CredentialQuery): Promise<void> {
  await execOrThrow('git', ['credential', 'reject'], {
    input: serializeCredential({ ...query }),
    env: nonInteractiveEnv,
  });
}
