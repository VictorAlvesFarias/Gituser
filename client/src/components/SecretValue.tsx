import { useState } from 'react';
import { Icon } from './Icon';

interface SecretValueProps {
  load: () => Promise<string>;
  onError: (message: string) => void;
}

function mask(value: string): string {
  return value.length <= 8 ? '••••••••' : `${value.slice(0, 4)}${'•'.repeat(8)}${value.slice(-4)}`;
}

/** A token that is only fetched from the server when the user asks to see or copy it. */
export function SecretValue({ load, onError }: SecretValueProps) {
  const [value, setValue] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function ensureValue(): Promise<string | null> {
    if (value !== null) return value;
    setLoading(true);
    try {
      const loaded = await load();
      setValue(loaded);
      return loaded;
    } catch (error) {
      onError((error as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function toggle() {
    if (visible) return setVisible(false);
    if ((await ensureValue()) !== null) setVisible(true);
  }

  async function copy() {
    const loaded = await ensureValue();
    if (loaded === null) return;
    await navigator.clipboard.writeText(loaded);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="secret">
      <code className="secret-value">{visible && value !== null ? value : value !== null ? mask(value) : '••••••••••••'}</code>
      <button className="icon-button" onClick={toggle} disabled={loading} title={visible ? 'Ocultar' : 'Mostrar'}>
        <Icon name={visible ? 'eyeOff' : 'eye'} />
      </button>
      <button className="icon-button" onClick={copy} disabled={loading} title="Copiar">
        <Icon name={copied ? 'check' : 'copy'} />
      </button>
    </div>
  );
}
