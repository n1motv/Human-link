import { useState } from 'react';
import { initials } from '../lib/format';
import { colorFor } from '../lib/branding';

interface Props {
  id?: string;
  prenom?: string;
  nom?: string;
  hasPhoto?: boolean;
  size?: number;
}

/** Photo protégée (servie par l'API avec le cookie de session), sinon initiales colorées. */
export function Avatar({ id, prenom, nom, hasPhoto, size = 40 }: Props) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: size * 0.38 };
  if (id && hasPhoto && !failed) {
    return <img src={`/api/users/${id}/photo`} alt="" width={size} height={size} style={style} className="shrink-0 rounded-full object-cover ring-1 ring-line" onError={() => setFailed(true)} loading="lazy" />;
  }
  const seed = `${prenom}${nom}`;
  return (
    <span aria-hidden style={{ ...style, background: `linear-gradient(135deg, ${colorFor(seed)}, ${colorFor(seed + 'x')})` }} className="grid shrink-0 place-items-center rounded-full font-bold text-white">
      {initials(prenom, nom) || '?'}
    </span>
  );
}
