import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runPowerShellScript } from './exec.ts';
import { paths } from './paths.ts';

// Tokens are encrypted with AES-256-GCM. On Windows the key itself is protected with DPAPI,
// so the key file is useless outside the current Windows user account.
const keyFile = () => join(paths.dataDir, 'key');
const useDpapi = process.platform === 'win32';
let keyPromise: Promise<Buffer> | null = null;

async function dpapi(mode: 'protect' | 'unprotect', data: Buffer): Promise<Buffer> {
  const output = await runPowerShellScript(join(paths.scriptsDir, 'dpapi.ps1'), [mode], data.toString('base64'));
  return Buffer.from(output.trim(), 'base64');
}

async function loadKey(): Promise<Buffer> {
  if (existsSync(keyFile())) {
    const stored = Buffer.from((await readFile(keyFile(), 'utf8')).trim(), 'base64');
    return useDpapi ? dpapi('unprotect', stored) : stored;
  }
  const key = randomBytes(32);
  const stored = useDpapi ? await dpapi('protect', key) : key;
  await mkdir(paths.dataDir, { recursive: true });
  await writeFile(keyFile(), stored.toString('base64'), { mode: 0o600 });
  return key;
}

function getKey(): Promise<Buffer> {
  keyPromise ??= loadKey().catch((error) => {
    keyPromise = null;
    throw error;
  });
  return keyPromise;
}

export async function encrypt(plain: string): Promise<string> {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', await getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return 'v1:' + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export async function decrypt(sealed: string): Promise<string> {
  const raw = Buffer.from(sealed.replace(/^v1:/, ''), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', await getKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}
