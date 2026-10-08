import { useState } from 'react';

interface AvatarProps {
  name: string | null;
  host?: string;
  username?: string;
  size?: number;
}

function initials(name: string | null): string {
  const parts = (name ?? '?').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar({ name, host, username, size = 44 }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const src = host === 'github.com' && username && !failed ? `https://github.com/${encodeURIComponent(username)}.png?size=${size * 2}` : null;

  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {src ? <img src={src} alt="" onError={() => setFailed(true)} /> : initials(name)}
    </div>
  );
}
