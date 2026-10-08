import { api } from '../api';
import type { Status, StoredCredential } from '../types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { SecretValue } from './SecretValue';

interface CredentialsPanelProps {
  status: Status;
  onSaveAsProfile: (credential: StoredCredential) => void;
  onRemove: (credential: StoredCredential) => void;
  onError: (message: string) => void;
}

export function CredentialsPanel({ status, onSaveAsProfile, onRemove, onError }: CredentialsPanelProps) {
  if (!status.credentialsSupported) {
    return <p className="empty">Listagem de credenciais disponível apenas no Windows (Credential Manager).</p>;
  }
  if (status.credentialsError) {
    return <p className="empty error-text">Não foi possível ler o Credential Manager: {status.credentialsError}</p>;
  }
  if (status.credentials.length === 0) {
    return <p className="empty">Nenhuma credencial do git salva no Windows.</p>;
  }

  return (
    <div className="card table-card">
      <table className="table">
        <thead>
          <tr>
            <th>Conta</th>
            <th>Host</th>
            <th>Token</th>
            <th aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {status.credentials.map((credential) => (
            <tr key={credential.target}>
              <td>
                <div className="cell-user">
                  <Avatar name={credential.username} host={credential.host} username={credential.username} size={28} />
                  <strong>{credential.username || '—'}</strong>
                  {credential.inUse && <span className="badge badge-active">Em uso</span>}
                </div>
              </td>
              <td>
                <span className="muted">{credential.protocol}://</span>
                {credential.host}
              </td>
              <td>
                <SecretValue
                  load={async () => (await api.fillCredential(credential)).password}
                  onError={onError}
                />
              </td>
              <td className="row-actions">
                <button className="button ghost small" onClick={() => onSaveAsProfile(credential)}>
                  <Icon name="save" />
                  Salvar como perfil
                </button>
                <button className="icon-button danger" onClick={() => onRemove(credential)} title="Remover do sistema">
                  <Icon name="trash" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
