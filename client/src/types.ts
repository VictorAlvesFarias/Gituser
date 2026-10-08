export interface Profile {
  id: string;
  label: string;
  name: string;
  email: string;
  protocol: string;
  host: string;
  username: string;
  hasToken: boolean;
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
  /** undefined keeps the current token, "" removes it. */
  token?: string;
}

export interface StoredCredential {
  target: string;
  protocol: string;
  host: string;
  username: string;
  inUse: boolean;
}

export interface Status {
  identity: { name: string | null; email: string | null };
  helpers: string[];
  pinned: Record<string, string>;
  credentials: StoredCredential[];
  credentialsSupported: boolean;
  credentialsError: string | null;
  activeProfileId: string | null;
  dataDir: string;
}

export interface CredentialQuery {
  protocol: string;
  host: string;
  username?: string;
}

export interface FilledCredential {
  protocol: string;
  host: string;
  username: string;
  password: string;
  /** Commit identity looked up from the provider (GitHub only, when requested). */
  suggested?: { name: string; email: string } | null;
}

export type BrowserLoginResult = FilledCredential;
