import { api } from '../api';
import type { Profile } from '../types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { SecretValue } from './SecretValue';

interface ProfileCardProps {
  profile: Profile;
  active: boolean;
  busy: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onError: (message: string) => void;
}

export function ProfileCard({ profile, active, busy, onActivate, onEdit, onDelete, onError }: ProfileCardProps) {
  return (
    <article className={`card profile-card${active ? ' is-active' : ''}`}>
      <header className="profile-head">
        <Avatar name={profile.name} host={profile.host} username={profile.username} />
        <div className="profile-title">
          <h3>{profile.label || profile.name}</h3>
          {profile.label && <span className="muted">{profile.name}</span>}
        </div>
        {active && <span className="badge badge-active">Em uso</span>}
      </header>

      <dl className="fields">
        <dt>E-mail</dt>
        <dd>{profile.email}</dd>
        <dt>Conta</dt>
        <dd>
          {profile.username ? (
            <>
              {profile.username}
              <span className="muted"> @ {profile.host}</span>
            </>
          ) : (
            <span className="muted">Sem credencial</span>
          )}
        </dd>
        <dt>Token</dt>
        <dd>
          {profile.hasToken ? (
            <SecretValue
              load={async () => (await api.profileToken(profile.id)).token ?? ''}
              onError={onError}
            />
          ) : (
            <span className="muted">Não salvo</span>
          )}
        </dd>
      </dl>

      <footer className="card-actions">
        <button className="button primary" onClick={onActivate} disabled={busy || active}>
          <Icon name={active ? 'check' : 'swap'} />
          {active ? 'Ativo' : busy ? 'Aplicando…' : 'Usar este'}
        </button>
        <span className="spacer" />
        <button className="icon-button" onClick={onEdit} title="Editar">
          <Icon name="edit" />
        </button>
        <button className="icon-button danger" onClick={onDelete} title="Excluir">
          <Icon name="trash" />
        </button>
      </footer>
    </article>
  );
}
