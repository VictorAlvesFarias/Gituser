import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import type { FilledCredential, Profile, ProfileInput, StoredCredential } from '../types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export interface ProfileDraft extends Omit<ProfileInput, 'token'> {
  token: string;
}

interface ProfileFormProps {
  /** The profile being edited, or null when creating a new one. */
  editing: Profile | null;
  initial: ProfileDraft;
  /** Credentials stored in the system, offered in the credential dropdown. */
  credentials: StoredCredential[];
  onClose: () => void;
  onSaved: (profile: Profile, activateNow: boolean) => void;
}

export function emptyDraft(): ProfileDraft {
  return { label: '', name: '', email: '', protocol: 'https', host: 'github.com', username: '', token: '' };
}

const newGitHubTokenUrl = 'https://github.com/settings/tokens/new?description=Gituser&scopes=repo,workflow,gist';

// Dropdown values besides stored credentials (whose value is their target).
const BROWSER = '__browser__';
const MANUAL = '__manual__';

function initialSource(draft: ProfileDraft, credentials: StoredCredential[]): string {
  const match = credentials.find(
    (c) => c.protocol === draft.protocol && c.host === draft.host && c.username === draft.username,
  );
  if (match) return match.target;
  if (draft.username) return MANUAL;
  return credentials.length > 0 ? '' : BROWSER;
}

export function ProfileForm({ editing, initial, credentials, onClose, onSaved }: ProfileFormProps) {
  const [draft, setDraft] = useState<ProfileDraft>(initial);
  const [source, setSource] = useState(() => initialSource(initial, credentials));
  const [removeToken, setRemoveToken] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [activateNow, setActivateNow] = useState(!editing);
  const [saving, setSaving] = useState(false);
  const [loadingToken, setLoadingToken] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loggedInAs, setLoggedInAs] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loginAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Closing the dialog also stops a pending browser login on the server.
  useEffect(() => () => loginAbort.current?.abort(), []);

  function close() {
    loginAbort.current?.abort();
    onClose();
  }

  const set = (field: keyof ProfileDraft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [field]: event.target.value }));

  function applyCredential(credential: FilledCredential) {
    setDraft((current) => ({
      ...current,
      protocol: credential.protocol,
      host: credential.host,
      username: credential.username,
      token: credential.password,
      label: current.label || credential.username,
      name: current.name || credential.suggested?.name || '',
      email: current.email || credential.suggested?.email || '',
    }));
    setRemoveToken(false);
  }

  async function selectSource(value: string) {
    loginAbort.current?.abort();
    setSource(value);
    setError(null);
    setLoggedInAs(null);
    const credential = credentials.find((c) => c.target === value);
    if (!credential) return;
    setLoadingToken(true);
    try {
      applyCredential(await api.fillCredential(credential, true));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingToken(false);
    }
  }

  async function loginWithBrowser() {
    const abort = new AbortController();
    loginAbort.current = abort;
    setLoggingIn(true);
    setError(null);
    try {
      const result = await api.browserLogin({ protocol: draft.protocol, host: draft.host }, abort.signal);
      applyCredential(result);
      setLoggedInAs(result.username);
    } catch (err) {
      if (!abort.signal.aborted) setError((err as Error).message);
    } finally {
      loginAbort.current = null;
      setLoggingIn(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const { token, ...fields } = draft;
    // Editing: an empty field keeps the stored token. Creating: an empty field means no token.
    const input: ProfileInput = { ...fields };
    if (removeToken) input.token = '';
    else if (token) input.token = token;
    try {
      const profile = editing ? await api.updateProfile(editing.id, input) : await api.createProfile(input);
      onSaved(profile, activateNow);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  const selected = credentials.find((c) => c.target === source);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <form className="modal card" onSubmit={submit}>
        <header className="modal-head">
          <h2>{editing ? 'Editar perfil' : 'Novo perfil'}</h2>
          <button type="button" className="icon-button" onClick={close} title="Fechar">
            <Icon name="x" />
          </button>
        </header>

        <fieldset>
          <legend>1 · Conta / credencial</legend>
          <label className="field">
            <span>Credencial</span>
            <select value={source} onChange={(event) => selectSource(event.target.value)} disabled={loggingIn}>
              <option value="" disabled>
                Selecione uma credencial…
              </option>
              {credentials.length > 0 && (
                <optgroup label="Salvas no Windows">
                  {credentials.map((c) => (
                    <option key={c.target} value={c.target}>
                      {c.username} @ {c.host}
                      {c.inUse ? '  (em uso)' : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Outra">
                <option value={BROWSER}>+ Nova conta (entrar pelo navegador)</option>
                <option value={MANUAL}>Preencher manualmente</option>
              </optgroup>
            </select>
          </label>

          {selected && (
            <div className="login-box is-done">
              <Avatar name={selected.username} host={selected.host} username={selected.username} size={36} />
              <div className="login-text">
                <strong>
                  {selected.username} <span className="muted">@ {selected.host}</span>
                </strong>
                <span className="muted small">
                  {loadingToken
                    ? 'Carregando token…'
                    : draft.token
                      ? 'Token carregado do Credential Manager.'
                      : editing?.hasToken
                        ? 'Mantendo o token já salvo no perfil.'
                        : 'Nenhum token carregado.'}
                </span>
              </div>
              {loadingToken && <div className="spinner" />}
            </div>
          )}

          {(source === BROWSER || source === MANUAL) && (
            <div className="row">
              <label className="field narrow">
                <span>Protocolo</span>
                <select value={draft.protocol} onChange={set('protocol')} disabled={loggingIn}>
                  <option value="https">https</option>
                  <option value="http">http</option>
                </select>
              </label>
              <label className="field">
                <span>Host</span>
                <input value={draft.host} onChange={set('host')} placeholder="github.com" disabled={loggingIn} />
              </label>
            </div>
          )}

          {source === BROWSER && (
            <div className={`login-box${loggedInAs ? ' is-done' : ''}`}>
              {loggingIn ? (
                <>
                  <div className="spinner" />
                  <div className="login-text">
                    <strong>Aguardando login no navegador…</strong>
                    <span className="muted small">
                      Autorize na aba que abriu. Se ela mostrar outra conta, troque de conta antes de autorizar.
                    </span>
                  </div>
                  <button type="button" className="button ghost small" onClick={() => loginAbort.current?.abort()}>
                    Cancelar
                  </button>
                </>
              ) : loggedInAs ? (
                <>
                  <Avatar name={loggedInAs} host={draft.host} username={loggedInAs} size={36} />
                  <div className="login-text">
                    <strong>Conectado como {loggedInAs}</strong>
                    <span className="muted small">Token obtido e salvo no Credential Manager.</span>
                  </div>
                  <button type="button" className="button ghost small" onClick={loginWithBrowser}>
                    Outra conta
                  </button>
                </>
              ) : (
                <>
                  <div className="login-text">
                    <strong>Entrar pelo navegador</strong>
                    <span className="muted small">
                      Faz login em {draft.host || 'host'} e pega o token automaticamente.
                    </span>
                  </div>
                  <button type="button" className="button primary" onClick={loginWithBrowser} disabled={!draft.host}>
                    <Icon name="key" />
                    Entrar
                  </button>
                </>
              )}
            </div>
          )}

          {source === MANUAL && (
            <>
              <label className="field">
                <span>Usuário</span>
                <input value={draft.username} onChange={set('username')} placeholder="login na plataforma" />
              </label>
              <label className="field">
                <span>Token / senha</span>
                <div className="input-with-actions">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={draft.token}
                    onChange={set('token')}
                    disabled={removeToken}
                    autoComplete="off"
                    placeholder={editing?.hasToken ? 'Deixe vazio para manter o token salvo' : 'ghp_…'}
                  />
                  <button type="button" className="icon-button" onClick={() => setShowToken(!showToken)} title="Mostrar">
                    <Icon name={showToken ? 'eyeOff' : 'eye'} />
                  </button>
                </div>
              </label>
              {draft.host === 'github.com' && (
                <a className="link small" href={newGitHubTokenUrl} target="_blank" rel="noreferrer">
                  Criar token no GitHub ↗
                </a>
              )}
            </>
          )}

          {editing?.hasToken && (
            <label className="check">
              <input type="checkbox" checked={removeToken} onChange={(e) => setRemoveToken(e.target.checked)} />
              Remover token salvo neste perfil
            </label>
          )}
        </fieldset>

        <fieldset>
          <legend>2 · Identidade dos commits</legend>
          <div className="row">
            <label className="field">
              <span>user.name *</span>
              <input value={draft.name} onChange={set('name')} required />
            </label>
            <label className="field">
              <span>user.email *</span>
              <input type="email" value={draft.email} onChange={set('email')} required />
            </label>
          </div>
          <label className="field">
            <span>Apelido do perfil</span>
            <input value={draft.label} onChange={set('label')} placeholder="Pessoal, Trabalho…" />
          </label>
        </fieldset>

        {error && <p className="form-error">{error}</p>}

        <footer className="modal-actions">
          <label className="check neutral">
            <input type="checkbox" checked={activateNow} onChange={(e) => setActivateNow(e.target.checked)} />
            Usar este perfil agora
          </label>
          <span className="spacer" />
          <button type="button" className="button ghost" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="button primary" disabled={saving || loggingIn || loadingToken}>
            <Icon name="save" />
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </footer>
      </form>
    </div>
  );
}
