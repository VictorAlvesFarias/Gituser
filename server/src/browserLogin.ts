import { exec } from './exec.ts';
import { credentialApprove, credentialFill, getCredentialHelpers, type Credential, type CredentialQuery } from './git.ts';
import { badRequest } from './validation.ts';

export interface BrowserLoginResult extends Credential {
  /** Commit identity suggested by the provider, when it could be looked up. */
  suggested: { name: string; email: string } | null;
}

const loginTimeoutMs = 5 * 60 * 1000;

// Interactive on purpose: the credential manager must be allowed to open the browser / its sign-in window.
const interactiveEnv: NodeJS.ProcessEnv = { GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '' };

// The GitHub browser flow needs no window of its own (the sign-in happens in the default browser),
// so keep the console hidden; otherwise the desktop app would flash a terminal window.
function gcm(args: string[], signal?: AbortSignal) {
  return exec('git', ['credential-manager', ...args], { env: interactiveEnv, signal, timeoutMs: loginTimeoutMs });
}

async function listGitHubAccounts(): Promise<string[]> {
  const result = await gcm(['github', 'list']);
  if (result.code !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function ensureCredentialManager(): Promise<void> {
  const helpers = await getCredentialHelpers();
  if (!helpers.some((helper) => /manager/i.test(helper))) {
    throw badRequest('O login pelo navegador precisa do Git Credential Manager configurado como credential.helper');
  }
}

/**
 * Runs `git credential-manager github login --browser`.
 * Returns the account that was added, or null when the browser authorized an account that was already stored.
 */
export async function addGitHubAccount(username: string | undefined, signal: AbortSignal): Promise<string | null> {
  await ensureCredentialManager();
  const before = new Set(await listGitHubAccounts());
  const args = ['github', 'login', '--browser', ...(username ? ['--username', username] : [])];
  const result = await gcm(args, signal);
  if (result.code !== 0) {
    throw badRequest(`Login cancelado ou falhou: ${result.stderr.trim() || `código ${result.code}`}`);
  }
  if (username) return username;
  const added = (await listGitHubAccounts()).filter((account) => !before.has(account));
  return added.length === 1 ? added[0] : null;
}

async function loginGitHub(username: string | undefined, signal: AbortSignal): Promise<string> {
  const before = await listGitHubAccounts();
  const added = await addGitHubAccount(username, signal);
  if (added) return added;
  throw badRequest(
    `O navegador autorizou uma conta que já estava salva (${before.join(', ')}). ` +
      'Para adicionar outra conta, troque de conta no GitHub (ou use uma janela anônima como navegador padrão) e tente de novo.',
  );
}

export async function suggestGitHubIdentity(token: string): Promise<BrowserLoginResult['suggested']> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'gituser', Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return null;
    const user = (await response.json()) as { id: number; login: string; name: string | null; email: string | null };
    return {
      name: user.name || user.login,
      // Private emails are hidden from the API; GitHub's noreply address still links commits to the account.
      email: user.email || `${user.id}+${user.login}@users.noreply.github.com`,
    };
  } catch {
    return null;
  }
}

/** Signs in through the browser using Git Credential Manager, which also stores the new credential. */
export async function browserLogin(query: CredentialQuery, signal: AbortSignal): Promise<BrowserLoginResult> {
  await ensureCredentialManager();

  if (query.host === 'github.com') {
    const username = await loginGitHub(query.username, signal);
    const credential = await credentialFill({ protocol: query.protocol, host: query.host, username });
    return { ...credential, suggested: await suggestGitHubIdentity(credential.password) };
  }

  // Other hosts (GitLab, Bitbucket, ...): let the credential manager prompt, then store what it returns.
  const result = await exec('git', ['credential', 'fill'], {
    input: `protocol=${query.protocol}\nhost=${query.host}\n${query.username ? `username=${query.username}\n` : ''}\n`,
    env: interactiveEnv,
    signal,
    timeoutMs: loginTimeoutMs,
    windowsHide: false,
  });
  const fields = Object.fromEntries(
    result.stdout
      .split(/\r?\n/)
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
  if (result.code !== 0 || !fields.password) throw badRequest('Login cancelado ou falhou');
  const credential: Credential = {
    protocol: query.protocol,
    host: query.host,
    username: fields.username ?? query.username ?? '',
    password: fields.password,
  };
  await credentialApprove(credential);
  return { ...credential, suggested: null };
}
