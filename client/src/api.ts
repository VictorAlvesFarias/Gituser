import type { BrowserLoginResult, CredentialQuery, FilledCredential, Profile, ProfileInput, Status } from './types';

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    signal,
    headers: {
      'x-gituser': '1',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Erro ${response.status}`);
  return data as T;
}

export const api = {
  status: () => request<Status>('GET', '/status'),
  profiles: () => request<Profile[]>('GET', '/profiles'),
  createProfile: (input: ProfileInput) => request<Profile>('POST', '/profiles', input),
  updateProfile: (id: string, input: ProfileInput) => request<Profile>('PUT', `/profiles/${id}`, input),
  deleteProfile: (id: string) => request<void>('DELETE', `/profiles/${id}`),
  profileToken: (id: string) => request<{ token: string | null }>('GET', `/profiles/${id}/token`),
  activateProfile: (id: string) => request<Status>('POST', `/profiles/${id}/activate`),
  fillCredential: (query: CredentialQuery, withIdentity = false) =>
    request<FilledCredential>('POST', '/credentials/fill', { ...query, withIdentity }),
  browserLogin: (query: CredentialQuery, signal: AbortSignal) =>
    request<BrowserLoginResult>('POST', '/credentials/login', query, signal),
  githubLogin: (signal: AbortSignal) =>
    request<{ added: string | null; status: Status }>('POST', '/credentials/github-login', {}, signal),
  removeCredential: (query: CredentialQuery) => request<Status>('POST', '/credentials/remove', query),
};
