import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Avatar } from './components/Avatar';
import { CredentialsPanel } from './components/CredentialsPanel';
import { Icon } from './components/Icon';
import { ProfileCard } from './components/ProfileCard';
import { emptyDraft, ProfileForm, type ProfileDraft } from './components/ProfileForm';
import type { Profile, Status, StoredCredential } from './types';

interface Toast {
  id: number;
  kind: 'ok' | 'error';
  message: string;
}

interface FormState {
  editing: Profile | null;
  initial: ProfileDraft;
}

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [githubLogin, setGithubLogin] = useState<AbortController | null>(null);

  const notify = useCallback((kind: Toast['kind'], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, kind, message }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4000);
  }, []);
  const notifyError = useCallback((message: string) => notify('error', message), [notify]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextStatus, nextProfiles] = await Promise.all([api.status(), api.profiles()]);
      setStatus(nextStatus);
      setProfiles(nextProfiles);
      setLoadError(null);
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function activate(profile: Profile) {
    setBusyId(profile.id);
    try {
      setStatus(await api.activateProfile(profile.id));
      notify('ok', `Agora usando "${profile.label || profile.name}" globalmente`);
    } catch (error) {
      notifyError((error as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(profile: Profile) {
    if (!confirm(`Excluir o perfil "${profile.label || profile.name}"? A configuração do git não é alterada.`)) return;
    try {
      await api.deleteProfile(profile.id);
      notify('ok', 'Perfil excluído');
      await refresh();
    } catch (error) {
      notifyError((error as Error).message);
    }
  }

  async function removeCredential(credential: StoredCredential) {
    if (!confirm(`Remover a credencial de ${credential.username}@${credential.host} do Windows?`)) return;
    try {
      setStatus(await api.removeCredential(credential));
      notify('ok', 'Credencial removida do sistema');
    } catch (error) {
      notifyError((error as Error).message);
    }
  }

  /** Runs `git credential-manager github login --browser` on the server. */
  async function runGithubLogin() {
    const abort = new AbortController();
    setGithubLogin(abort);
    try {
      const { added, status: nextStatus } = await api.githubLogin(abort.signal);
      setStatus(nextStatus);
      notify(
        'ok',
        added ? `Conta ${added} adicionada ao Credential Manager` : 'Login concluído — essa conta já estava salva',
      );
    } catch (error) {
      if (!abort.signal.aborted) notifyError((error as Error).message);
    } finally {
      setGithubLogin(null);
    }
  }

  async function tryFillToken(protocol: string, host: string, username?: string) {
    try {
      return await api.fillCredential({ protocol, host, username });
    } catch {
      return null;
    }
  }

  async function saveCurrentIdentity() {
    if (!status) return;
    const draft = emptyDraft();
    const pinned = status.pinned[`${draft.protocol}://${draft.host}`];
    const inUse = status.credentials.find((c) => c.host === draft.host && c.inUse)?.username;
    const filled = await tryFillToken(draft.protocol, draft.host, pinned ?? inUse);
    setForm({
      editing: null,
      initial: {
        ...draft,
        name: status.identity.name ?? '',
        email: status.identity.email ?? '',
        username: filled?.username ?? pinned ?? inUse ?? '',
        token: filled?.password ?? '',
      },
    });
  }

  async function saveCredentialAsProfile(credential: StoredCredential) {
    const filled = await tryFillToken(credential.protocol, credential.host, credential.username);
    setForm({
      editing: null,
      initial: {
        ...emptyDraft(),
        label: credential.username,
        name: credential.inUse ? (status?.identity.name ?? '') : '',
        email: credential.inUse ? (status?.identity.email ?? '') : '',
        protocol: credential.protocol,
        host: credential.host,
        username: credential.username,
        token: filled?.password ?? '',
      },
    });
  }

  async function onSaved(profile: Profile, activateNow: boolean) {
    notify('ok', form?.editing ? 'Perfil atualizado' : `Perfil "${profile.label || profile.name}" salvo`);
    setForm(null);
    if (activateNow) await activate(profile);
    await refresh();
  }

  const openNewProfile = () => setForm({ editing: null, initial: emptyDraft() });

  const activeProfile = profiles.find((p) => p.id === status?.activeProfileId) ?? null;
  const githubAccount =
    status?.pinned['https://github.com'] ?? status?.credentials.find((c) => c.host === 'github.com' && c.inUse)?.username;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <circle cx="6" cy="6" r="2.5" />
              <circle cx="6" cy="18" r="2.5" />
              <circle cx="18" cy="12" r="2.5" />
              <path d="M6 8.5v7M8.3 7.2 15.7 11" />
            </svg>
          </span>
          <div>
            <h1>Gituser</h1>
            <p className="muted">Identidades e credenciais do git neste PC</p>
          </div>
        </div>
        <button className="button ghost" onClick={refresh} disabled={loading}>
          <Icon name="refresh" />
          Atualizar
        </button>
      </header>

      {loadError && (
        <div className="banner error">
          Não foi possível falar com o servidor: {loadError}. Ele está rodando (<code>npm run dev</code>)?
        </div>
      )}

      {status && (
        <section className="card current">
          <Avatar name={status.identity.name} host="github.com" username={githubAccount} size={64} />
          <div className="current-info">
            <span className="eyebrow">Configuração global atual</span>
            <h2>{status.identity.name ?? <span className="muted">user.name não definido</span>}</h2>
            <p>{status.identity.email ?? <span className="muted">user.email não definido</span>}</p>
            <div className="chips">
              {githubAccount && (
                <span className="chip">
                  <Icon name="key" size={13} /> {githubAccount} @ github.com
                </span>
              )}
              {status.helpers.length > 0 && (
                <span className="chip" title={status.helpers.join('\n')}>
                  helper: {status.helpers.at(-1)!.split(/[\\/]/).pop()}
                </span>
              )}
              {activeProfile ? (
                <span className="chip chip-accent">Perfil: {activeProfile.label || activeProfile.name}</span>
              ) : (
                <span className="chip chip-warn">Não corresponde a nenhum perfil salvo</span>
              )}
            </div>
          </div>
          {!activeProfile && status.identity.email && (
            <button className="button" onClick={saveCurrentIdentity}>
              <Icon name="save" />
              Salvar como perfil
            </button>
          )}
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Perfis salvos</h2>
          <button className="button primary" onClick={openNewProfile}>
            <Icon name="plus" />
            Novo perfil
          </button>
        </div>
        {profiles.length === 0 && !loading ? (
          <p className="empty">Nenhum perfil ainda. Salve a configuração atual ou crie um novo perfil.</p>
        ) : (
          <div className="grid">
            {profiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                active={profile.id === status?.activeProfileId}
                busy={busyId === profile.id}
                onActivate={() => activate(profile)}
                onEdit={() => setForm({ editing: profile, initial: { ...profile, token: '' } })}
                onDelete={() => remove(profile)}
                onError={notifyError}
              />
            ))}
          </div>
        )}
      </section>

      {status && (
        <section className="section">
          <div className="section-head">
            <h2>Credenciais no Windows</h2>
            <div className="head-actions">
              {githubLogin ? (
                <>
                  <span className="waiting small">
                    <span className="spinner small" />
                    Aguardando login no navegador…
                  </span>
                  <button className="button ghost small" onClick={() => githubLogin.abort()}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  className="button"
                  onClick={runGithubLogin}
                  title="Executa: git credential-manager github login --browser"
                >
                  <Icon name="key" />
                  Login GitHub (GCM)
                </button>
              )}
              <button className="button" onClick={openNewProfile} title="Entrar pelo navegador e criar um perfil">
                <Icon name="plus" />
                Adicionar conta + perfil
              </button>
            </div>
          </div>
          <CredentialsPanel
            status={status}
            onSaveAsProfile={saveCredentialAsProfile}
            onRemove={removeCredential}
            onError={notifyError}
          />
        </section>
      )}

      {status && (
        <footer className="footer muted small">
          Perfis salvos em <code>{status.dataDir}</code> · tokens criptografados (AES-256-GCM, chave protegida pelo DPAPI)
        </footer>
      )}

      {form && (
        <ProfileForm
          editing={form.editing}
          initial={form.initial}
          credentials={status?.credentials ?? []}
          onClose={() => setForm(null)}
          onSaved={onSaved}
        />
      )}

      <div className="toasts">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
