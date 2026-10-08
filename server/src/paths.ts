import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const here = import.meta.dirname;

/** Read at call time so the desktop app can point them at its packaged resources. */
export const paths = {
  dataDir: process.env.GITUSER_HOME ?? join(homedir(), '.gituser'),
  scriptsDir: resolve(here, '..', 'scripts'),
  clientDistDir: resolve(here, '..', '..', 'client', 'dist'),
};

export function configurePaths(overrides: Partial<typeof paths>): void {
  Object.assign(paths, overrides);
}
