import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import express, { type ErrorRequestHandler } from 'express';
import { addGitHubAccount, browserLogin, suggestGitHubIdentity } from './browserLogin.ts';
import { canListStoredCredentials, listStoredCredentials, type StoredCredential } from './credentialStore.ts';
import {
  credentialApprove,
  credentialFill,
  credentialReject,
  getCredentialHelpers,
  getGlobal,
  getPinnedUsernames,
  setGlobal,
} from './git.ts';
import { paths } from './paths.ts';
import {
  createProfile,
  deleteProfile,
  getProfile,
  listProfiles,
  updateProfile,
  type Profile,
} from './profileStore.ts';
import { decrypt } from './secrets.ts';
import { badRequest, parseCredentialQuery, parseProfileInput } from './validation.ts';

// The API changes global git config and can reveal tokens, so only accept same-machine requests
// carrying a custom header (blocks DNS rebinding and cross-site requests from other pages).
const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function toPublic(profile: Profile) {
  const { token, ...rest } = profile;
  return { ...rest, hasToken: Boolean(token) };
}

function credentialUrl(p: { protocol: string; host: string }): string {
  return `${p.protocol}://${p.host}`;
}

async function readStoredCredentials(): Promise<{ list: StoredCredential[]; error: string | null }> {
  try {
    return { list: await listStoredCredentials(), error: null };
  } catch (error) {
    return { list: [], error: (error as Error).message };
  }
}

async function buildStatus() {
  const [name, email, helpers, pinned, profiles, stored] = await Promise.all([
    getGlobal('user.name'),
    getGlobal('user.email'),
    getCredentialHelpers(),
    getPinnedUsernames(),
    listProfiles(),
    readStoredCredentials(),
  ]);

  // Which account git will use for a host: the pinned username, or the only stored one.
  const effectiveUsername = (p: { protocol: string; host: string }) => {
    const url = credentialUrl(p);
    if (pinned[url]) return pinned[url];
    const forHost = stored.list.filter((c) => credentialUrl(c) === url);
    return forHost.length === 1 ? forHost[0].username : undefined;
  };

  const active = profiles.find(
    (p) => p.name === name && p.email === email && (!p.username || effectiveUsername(p) === p.username),
  );

  return {
    identity: { name, email },
    helpers,
    pinned,
    credentials: stored.list.map((c) => ({ ...c, inUse: effectiveUsername(c) === c.username })),
    credentialsSupported: canListStoredCredentials,
    credentialsError: stored.error,
    activeProfileId: active?.id ?? null,
    dataDir: paths.dataDir,
  };
}

export function createApp() {
  const app = express();
  app.use(express.json());

  app.use('/api', (req, res, next) => {
    if (!allowedHosts.has(req.hostname) || req.get('x-gituser') !== '1') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  });

  app.get('/api/status', async (_req, res) => {
    res.json(await buildStatus());
  });

  app.get('/api/profiles', async (_req, res) => {
    res.json((await listProfiles()).map(toPublic));
  });

  app.post('/api/profiles', async (req, res) => {
    res.status(201).json(toPublic(await createProfile(parseProfileInput(req.body ?? {}))));
  });

  app.put('/api/profiles/:id', async (req, res) => {
    res.json(toPublic(await updateProfile(req.params.id, parseProfileInput(req.body ?? {}))));
  });

  app.delete('/api/profiles/:id', async (req, res) => {
    await deleteProfile(req.params.id);
    res.status(204).end();
  });

  app.get('/api/profiles/:id/token', async (req, res) => {
    const profile = await getProfile(req.params.id);
    res.json({ token: profile.token ? await decrypt(profile.token) : null });
  });

  app.post('/api/profiles/:id/activate', async (req, res) => {
    const profile = await getProfile(req.params.id);
    await setGlobal('user.name', profile.name);
    await setGlobal('user.email', profile.email);
    if (profile.host && profile.username) {
      // Pinning the username makes the credential helper pick this account for the host.
      await setGlobal(`credential.${credentialUrl(profile)}.username`, profile.username);
      if (profile.token) {
        await credentialApprove({
          protocol: profile.protocol,
          host: profile.host,
          username: profile.username,
          password: await decrypt(profile.token),
        });
      }
    }
    res.json(await buildStatus());
  });

  app.post('/api/credentials/fill', async (req, res) => {
    const credential = await credentialFill(parseCredentialQuery(req.body ?? {}));
    if (!credential.password) throw badRequest('O helper não retornou um token');
    const wantsIdentity = req.body?.withIdentity === true && credential.host === 'github.com';
    res.json({ ...credential, suggested: wantsIdentity ? await suggestGitHubIdentity(credential.password) : null });
  });

  app.post('/api/credentials/login', async (req, res) => {
    const query = parseCredentialQuery(req.body ?? {});
    // Stop the login process if the user closes the dialog or the page.
    const abort = new AbortController();
    res.on('close', () => !res.writableFinished && abort.abort());
    res.json(await browserLogin(query, abort.signal));
  });

  app.post('/api/credentials/github-login', async (req, res) => {
    const { username } = parseCredentialQuery({ ...req.body, host: 'github.com' });
    const abort = new AbortController();
    res.on('close', () => !res.writableFinished && abort.abort());
    const added = await addGitHubAccount(username, abort.signal);
    res.json({ added, status: await buildStatus() });
  });

  app.post('/api/credentials/remove', async (req, res) => {
    await credentialReject(parseCredentialQuery(req.body ?? {}, { requireUsername: true }));
    res.json(await buildStatus());
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  if (existsSync(paths.clientDistDir)) {
    app.use(express.static(paths.clientDistDir));
  }

  app.use(errorHandler);
  return app;
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  // The client went away (e.g. cancelled a browser login); there is nobody to answer.
  if (error.name === 'AbortError' || res.headersSent) return;
  const status = typeof error.status === 'number' ? error.status : 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: error.message ?? 'Erro inesperado' });
};

/** Starts the API (and the built UI, when present) on 127.0.0.1. Port 0 picks a free port. */
export function startServer(port: number): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve, reject) => {
    const server = createApp().listen(port, '127.0.0.1', (error?: Error) => {
      if (error) return reject(error);
      resolve({ port: (server.address() as AddressInfo).port, close: () => server.close() });
    });
  });
}
