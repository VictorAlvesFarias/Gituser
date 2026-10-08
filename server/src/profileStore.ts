import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { paths } from './paths.ts';
import { encrypt } from './secrets.ts';

export interface Profile {
  id: string;
  label: string;
  name: string;
  email: string;
  protocol: string;
  host: string;
  username: string;
  /** AES-GCM sealed token, see secrets.ts. */
  token?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileInput {
  label: string;
  name: string;
  email: string;
  protocol: string;
  host: string;
  username: string;
  /** undefined keeps the current token, "" removes it, anything else replaces it. */
  token?: string;
}

const profilesFile = () => join(paths.dataDir, 'profiles.json');

export function notFound(message: string): Error {
  return Object.assign(new Error(message), { status: 404 });
}

async function readAll(): Promise<Profile[]> {
  if (!existsSync(profilesFile())) return [];
  return JSON.parse(await readFile(profilesFile(), 'utf8')) as Profile[];
}

async function writeAll(profiles: Profile[]): Promise<void> {
  await mkdir(paths.dataDir, { recursive: true });
  const tmp = profilesFile() + '.tmp';
  await writeFile(tmp, JSON.stringify(profiles, null, 2), { mode: 0o600 });
  await rename(tmp, profilesFile());
}

// Serialize writes so concurrent requests can't clobber each other.
let queue: Promise<unknown> = Promise.resolve();
function mutate<T>(fn: (profiles: Profile[]) => Promise<{ profiles: Profile[]; result: T }>): Promise<T> {
  const next = queue.then(async () => {
    const { profiles, result } = await fn(await readAll());
    await writeAll(profiles);
    return result;
  });
  queue = next.catch(() => undefined);
  return next;
}

export function listProfiles(): Promise<Profile[]> {
  return readAll();
}

export async function getProfile(id: string): Promise<Profile> {
  const profile = (await readAll()).find((p) => p.id === id);
  if (!profile) throw notFound('Perfil não encontrado');
  return profile;
}

async function applyToken(profile: Profile, token: string | undefined): Promise<Profile> {
  if (token === undefined) return profile;
  const { token: _previous, ...rest } = profile;
  return token === '' ? rest : { ...rest, token: await encrypt(token) };
}

export function createProfile(input: ProfileInput): Promise<Profile> {
  return mutate(async (profiles) => {
    const now = new Date().toISOString();
    const { token, ...fields } = input;
    const profile = await applyToken({ ...fields, id: randomUUID(), createdAt: now, updatedAt: now }, token);
    return { profiles: [...profiles, profile], result: profile };
  });
}

export function updateProfile(id: string, input: ProfileInput): Promise<Profile> {
  return mutate(async (profiles) => {
    const index = profiles.findIndex((p) => p.id === id);
    if (index < 0) throw notFound('Perfil não encontrado');
    const { token, ...fields } = input;
    const profile = await applyToken({ ...profiles[index], ...fields, updatedAt: new Date().toISOString() }, token);
    return { profiles: profiles.with(index, profile), result: profile };
  });
}

export function deleteProfile(id: string): Promise<void> {
  return mutate(async (profiles) => ({ profiles: profiles.filter((p) => p.id !== id), result: undefined }));
}
