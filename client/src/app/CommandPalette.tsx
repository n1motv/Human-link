import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, LogOut, Moon, Search, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useUser } from '../lib/auth';
import { useSessionFlow } from './SessionFlow';
import { useConfig } from '../lib/config';
import { useTheme } from '../lib/theme';
import { COMMON_NAV, NAV, type NavItem } from './nav';

interface Cmd {
  id: string;
  group: 'pages' | 'actions';
  label: string;
  icon: ReactNode;
  run: () => void;
}

/** Palette de commandes (Ctrl/⌘ + K) : aller à une page ou lancer une action sans toucher à la souris. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const user = useUser();
  const { signOut } = useSessionFlow();
  const { modules } = useConfig();
  const { theme, toggle } = useTheme();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const commands = useMemo<Cmd[]>(() => {
    const enabled = (i: NavItem) => !i.module || modules[i.module];
    const items = [...NAV[user.role].flatMap((g) => g.items), ...COMMON_NAV].filter(enabled);
    const pages: Cmd[] = items.map((i) => ({
      id: i.to,
      group: 'pages',
      label: t(i.label),
      icon: <i.icon size={16} aria-hidden />,
      run: () => nav(i.to),
    }));
    const actions: Cmd[] = [
      { id: 'theme', group: 'actions', label: t('common.toggleTheme'), icon: theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />, run: toggle },
      {
        id: 'logout',
        group: 'actions',
        label: t('auth.logout'),
        icon: <LogOut size={16} />,
        run: () => void signOut(),
      },
    ];
    return [...pages, ...actions];
  }, [user.role, modules, t, nav, theme, toggle, signOut]);

  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const results = useMemo(() => {
    const needle = norm(q.trim());
    return needle ? commands.filter((c) => norm(c.label).includes(needle)) : commands;
  }, [q, commands]);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
    }
  }, [open]);
  useEffect(() => setActive(0), [q]);
  // Échap fonctionne quel que soit l'élément qui a le focus (fond flou cliqué, etc.).
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && (e.preventDefault(), onClose());
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, onClose]);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const choose = (c?: Cmd) => {
    if (!c) return;
    onClose();
    c.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, results.length - 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
    else if (e.key === 'Enter') (e.preventDefault(), choose(results[active]));
    else if (e.key === 'Escape') (e.preventDefault(), onClose());
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] grid place-items-start justify-items-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden onMouseDown={onClose} />
      <div role="dialog" aria-modal="true" aria-label={t('palette.placeholder')} className="glass-strong rise relative w-full max-w-xl overflow-hidden !p-0" onKeyDown={onKey}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="text-muted" aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('palette.placeholder')}
            aria-label={t('palette.placeholder')}
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            className="h-14 w-full bg-transparent text-base outline-none placeholder:text-subtle"
          />
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-xs text-subtle sm:block">Esc</kbd>
        </div>
        <ul ref={listRef} id="palette-list" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">{t('palette.empty')}</li>}
          {results.map((c, i) => (
            <li key={c.id} role="presentation">
              {(i === 0 || results[i - 1]!.group !== c.group) && <p className="px-3 pb-1 pt-3 text-xs font-semibold text-subtle">{t(`palette.${c.group}`)}</p>}
              <div
                role="option"
                aria-selected={i === active}
                data-active={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(c)}
                className={clsx('flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm', i === active ? 'bg-accent/15 text-fg' : 'text-muted')}
              >
                <span className={i === active ? 'text-accent' : ''}>{c.icon}</span>
                <span className="flex-1 truncate">{c.label}</span>
                {i === active && <CornerDownLeft size={14} aria-hidden className="text-subtle" />}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
