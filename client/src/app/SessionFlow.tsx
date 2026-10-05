import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { HOME } from './nav';
import { useAuth } from '../lib/auth';
import { useConfig } from '../lib/config';
import { useTheme } from '../lib/theme';
import type { User } from '../lib/types';

type Kind = 'login' | 'logout';
type Phase = 'in' | 'out';
interface Screen {
  kind: Kind;
  name: string;
  phase: Phase;
}

interface Flow {
  /** Connexion réussie : écran d'accueil, puis ouverture de la session et navigation. */
  signIn: (r: { user: User; pending2fa: boolean }, from?: string) => Promise<void>;
  /** Déconnexion : écran d'au revoir, fermeture de la session côté serveur, retour à la connexion. */
  signOut: () => Promise<void>;
}

const Ctx = createContext<Flow | null>(null);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Écrans de transition de connexion et de déconnexion : plein écran, aux couleurs du client. */
export function SessionFlowProvider({ children }: { children: ReactNode }) {
  const { setSession, logout, user } = useAuth();
  const nav = useNavigate();
  const [screen, setScreen] = useState<Screen | null>(null);
  const busy = useRef(false);

  const play = useCallback(async (kind: Kind, name: string, work: () => Promise<unknown>, finish: () => void) => {
    if (busy.current) return;
    busy.current = true;
    const fast = reduced();
    setScreen({ kind, name, phase: 'in' });
    try {
      await Promise.all([sleep(fast ? 500 : kind === 'login' ? 1700 : 1500), work().catch(() => undefined)]);
    } finally {
      finish();
      await sleep(80);
      setScreen((s) => (s ? { ...s, phase: 'out' } : s));
      await sleep(fast ? 50 : 450);
      setScreen(null);
      busy.current = false;
    }
  }, []);

  const flow = useMemo<Flow>(
    () => ({
      signIn: (r, from) =>
        play(
          'login',
          r.user.prenom,
          async () => undefined,
          () => {
            setSession(r.user, r.pending2fa);
            nav(r.pending2fa ? '/setup-2fa' : (from ?? HOME[r.user.role]), { replace: true });
          },
        ),
      signOut: () =>
        play(
          'logout',
          user?.prenom ?? '',
          () => logout(),
          () => nav('/login', { replace: true }),
        ),
    }),
    [play, setSession, nav, logout, user?.prenom],
  );

  return (
    <Ctx.Provider value={flow}>
      {children}
      {screen && createPortal(<SessionScreen screen={screen} />, document.body)}
    </Ctx.Provider>
  );
}

export function useSessionFlow(): Flow {
  const c = useContext(Ctx);
  if (!c) throw new Error('SessionFlowProvider manquant');
  return c;
}

function SessionScreen({ screen }: { screen: Screen }) {
  const { t } = useTranslation();
  const cfg = useConfig();
  const { theme } = useTheme();
  const [broken, setBroken] = useState(false);
  const login = screen.kind === 'login';

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx('session-screen fixed inset-0 z-[400] grid place-items-center overflow-hidden px-6', screen.phase === 'out' ? 'session-out' : 'session-in')}
      style={{ background: 'var(--bg)' }}
    >
      <div className="session-orbs" aria-hidden />
      <div className="relative flex max-w-md flex-col items-center gap-6 text-center">
        <div className="relative grid h-36 w-36 place-items-center">
          <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
            <defs>
              <linearGradient id="sess-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--accent)" />
                <stop offset="100%" stopColor="var(--accent-2)" />
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r="54" fill="none" stroke="var(--glass-border)" strokeWidth="3" />
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="url(#sess-grad)"
              strokeWidth="4"
              strokeLinecap="round"
              pathLength={100}
              className={login ? 'session-ring' : 'session-ring-out'}
            />
          </svg>
          <div className="session-badge grid h-24 w-24 place-items-center rounded-full border border-line bg-glass-strong shadow-xl">
            {login ? (
              <svg viewBox="0 0 52 52" className="h-12 w-12" aria-hidden>
                <path
                  d="M14 27 l8 8 l16 -18"
                  fill="none"
                  stroke="url(#sess-grad)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={100}
                  className="session-check"
                />
              </svg>
            ) : (
              <LogOut size={34} className="session-door text-accent" aria-hidden />
            )}
          </div>
        </div>

        <div className="session-text space-y-2">
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{login ? t('session.welcome', { name: screen.name }) : t('session.bye', { name: screen.name })}</h1>
          <p className="text-muted">{login ? t('session.preparing') : t('session.byeHint')}</p>
        </div>

        <div className="session-brand mt-2 flex items-center gap-3 opacity-80">
          {!broken ? (
            <img
              src={theme === 'dark' ? cfg.branding.logoOnDarkUrl : cfg.branding.logoUrl}
              alt=""
              className="h-7 w-auto max-w-[140px] object-contain"
              onError={() => setBroken(true)}
            />
          ) : (
            <span className="gradient-text font-display text-lg font-extrabold">{cfg.company.name}</span>
          )}
        </div>
      </div>
    </div>
  );
}
