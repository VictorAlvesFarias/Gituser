import type { CredentialQuery } from './git.ts';
import type { ProfileInput } from './profileStore.ts';

export function badRequest(message: string): Error {
  return Object.assign(new Error(message), { status: 400 });
}

type Body = Record<string, unknown>;

// git config values and the credential protocol are line based, so newlines must never get through.
function text(body: Body, field: string, label: string, { required = false, max = 200 } = {}): string {
  const raw = body[field];
  if (raw !== undefined && raw !== null && typeof raw !== 'string') throw badRequest(`${label} inválido`);
  const value = (raw ?? '').trim();
  if (required && !value) throw badRequest(`${label} é obrigatório`);
  if (value.length > max) throw badRequest(`${label} é muito longo`);
  if (/[\r\n\0]/.test(value)) throw badRequest(`${label} não pode ter quebras de linha`);
  return value;
}

function protocol(body: Body): string {
  const value = text(body, 'protocol', 'Protocolo') || 'https';
  if (value !== 'https' && value !== 'http') throw badRequest('Protocolo deve ser https ou http');
  return value;
}

function host(body: Body, required: boolean): string {
  const value = text(body, 'host', 'Host', { required }).toLowerCase();
  if (value && !/^[a-z0-9.-]+(:\d+)?$/.test(value)) throw badRequest('Host inválido (ex.: github.com)');
  return value;
}

export function parseProfileInput(body: Body): ProfileInput {
  const email = text(body, 'email', 'E-mail', { required: true });
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw badRequest('E-mail inválido');
  const input: ProfileInput = {
    label: text(body, 'label', 'Apelido', { max: 60 }),
    name: text(body, 'name', 'Nome', { required: true }),
    email,
    protocol: protocol(body),
    host: host(body, false),
    username: text(body, 'username', 'Usuário'),
  };
  if (input.username && !input.host) throw badRequest('Informe o host da credencial');
  if (body.token !== undefined) input.token = text(body, 'token', 'Token', { max: 1000 });
  if (input.token && !input.username) throw badRequest('Informe o usuário da credencial para salvar um token');
  return input;
}

export function parseCredentialQuery(body: Body, { requireUsername = false } = {}): CredentialQuery {
  const username = text(body, 'username', 'Usuário', { required: requireUsername });
  return { protocol: protocol(body), host: host(body, true), ...(username ? { username } : {}) };
}
