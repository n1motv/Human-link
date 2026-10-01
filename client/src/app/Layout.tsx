import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Languages, LogOut, Menu, Moon, ShieldCheck, Sun, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../components/Avatar';
import { useAuth, useUser } from '../lib/auth';
import { useConfig } from '../lib/config';
import { LANGUAGE_NAMES } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { COMMON_NAV, NAV, type NavItem } from './nav';
import { NotificationBell } from './NotificationBell';
import { ChatWidget } from './ChatWidget';

function Brand() {
  const cfg = useConfig();
  const { theme } = useTheme();
  const [broken, setBroken] = useState(false);
  const src = theme === 'dark' ? cfg.branding.logoOnDarkUrl : cfg.branding.logoUrl;
  return (
    <div className="flex items-center gap-3 px-2">
      {!broken && <img src={src} alt="" className="h-9 w-auto max-w-[120px] object-contain" onError={() => setBroken(true)} />}
      {(cfg.branding.showName || broken) && <span className="gradient-text text-lg font-extrabold tracking-tight">{cfg.company.name}</span>}
    </div>
  );
}

function SideLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const user = useUser();
  const { modules } = useConfig();
  const enabled = (i: NavItem) => !i.module || modules[i.module];
  const link = (i: NavItem) => (
    <NavLink key={i.to} to={i.to} end={i.end} onClick={onNavigate} className="nav-link">
      <i.icon size={18} aria-hidden />
      <span className="truncate">{t(i.label)}</span>
    </NavLink>
  );
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-1 py-2" aria-label="Navigation principale">
      {NAV[user.role].map((g, idx) => {
        const items = g.items.filter(enabled);
        if (!items.length) return null;
        return (
          <div key={idx} className="space-y-1">
            {g.title && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-subtle">{t(g.title)}</p>}
            {items.map(link)}
          </div>
        );
      })}
      <div className="space-y-1 border-t border-line pt-4">{COMMON_NAV.filter(enabled).map(link)}</div>
    </nav>
  );
}

function LanguageMenu() {
  const { i18n } = useTranslation();
  const { i18n: cfg } = useConfig();
  if (cfg.languages.length < 2) return null;
  return (
    <label className="relative">
      <span className="sr-only">Langue</span>
      <Languages size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      <select
        value={cfg.languages.includes(i18n.language) ? i18n.language : 'fr'}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        className="field !min-h-10 w-auto !rounded-full !py-1 !ps-9 !pe-3 text-sm"
      >
        {cfg.languages.map((l) => (
          <option key={l} value={l}>
            {LANGUAGE_NAMES[l] ?? l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { t } = useTranslation();
  return (
    <button onClick={toggle} className="btn btn-icon" aria-label={t('common.toggleTheme')} title={t('common.toggleTheme')}>
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export function Layout() {
  const { t } = useTranslation();
  const user = useUser();
  const { logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const { modules } = useConfig();

  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);

  const doLogout = async () => {
    await logout();
    nav('/login', { replace: true });
  };

  return (
    <div className="min-h-screen lg:ps-72">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-white">
        {t('common.skipToContent')}
      </a>

      {/* Menu latéral (desktop) */}
      <aside className="glass-strong fixed inset-y-3 start-3 z-30 hidden w-64 flex-col gap-3 p-4 lg:flex">
        <Brand />
        <SideLinks />
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-glass p-3">
          <Avatar id={user.id} prenom={user.prenom} nom={user.nom} hasPhoto={!!user.photoFileId} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {user.prenom} {user.nom}
            </p>
            <p className="truncate text-xs text-muted">{t(`role.${user.role}`)}</p>
          </div>
          <button onClick={doLogout} className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-fg" aria-label={t('auth.logout')} title={t('auth.logout')}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Tiroir (mobile) */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <aside className="glass-strong absolute inset-y-2 start-2 flex w-72 max-w-[85vw] flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <Brand />
              <button aria-label={t('common.close')} onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-glass-hover">
                <X size={18} />
              </button>
            </div>
            <SideLinks onNavigate={() => setOpen(false)} />
            <button onClick={doLogout} className="btn">
              <LogOut size={16} /> {t('auth.logout')}
            </button>
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 px-3 pt-3 sm:px-6">
          <div className="glass flex items-center gap-2 px-3 py-2 sm:px-4">
            <button className="btn btn-icon lg:hidden" onClick={() => setOpen(true)} aria-label={t('common.menu')}>
              <Menu size={18} />
            </button>
            <div className="flex-1" />
            <LanguageMenu />
            <ThemeToggle />
            <NotificationBell />
            <NavLink to="/security" className="btn btn-icon hidden sm:inline-flex" aria-label={t('nav.security')} title={t('nav.security')}>
              <ShieldCheck size={18} />
            </NavLink>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-3 py-6 outline-none sm:px-6 sm:py-8">
          <Outlet />
        </main>

        <footer className="px-6 pb-6 text-center text-xs text-subtle">
          <NavLink to="/privacy" className="hover:text-fg hover:underline">
            {t('nav.privacy')}
          </NavLink>
        </footer>
      </div>

      {modules.chatbot && user.role !== 'admin' && <ChatWidget />}
    </div>
  );
}
