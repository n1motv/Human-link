import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Check, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { Avatar } from './Avatar';

export interface Person {
  id: string;
  prenom: string;
  nom: string;
  matricule?: string;
  role?: string;
  poste?: string;
  photoFileId?: string | null;
}

const SHOWN = 12;

interface Props {
  value: Person | null;
  onChange: (p: Person | null) => void;
  /** Filtres envoyés à /users, ex. « status=active&role=manager ». La recherche se fait côté serveur : aucune limite d'effectif. */
  filter?: string;
  /** Personnes à ne pas proposer (ex. le responsable déjà choisi). */
  exclude?: string[];
  placeholder?: string;
  'aria-label'?: string;
}

/** Choix d'une personne par recherche (nom, matricule, e-mail, service) : interroge le serveur au fil de la frappe. */
export function PersonPicker({ value, onChange, filter = 'status=active', exclude = [], placeholder, ...rest }: Props) {
  const { t } = useTranslation();
  const uid = useId();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const h = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(h);
  }, [term]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const q = useQuery({
    queryKey: ['people', filter, debounced],
    queryFn: () => api.get<{ items: Person[]; total: number }>(`/users?${filter}&limit=${SHOWN + exclude.length}${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const items = (q.data?.items ?? []).filter((p) => !exclude.includes(p.id)).slice(0, SHOWN);
  const more = Math.max(0, (q.data?.total ?? 0) - exclude.length - items.length);

  const pick = (p: Person) => {
    onChange(p);
    setOpen(false);
    setTerm('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && open) return (e.preventDefault(), e.stopPropagation(), setOpen(false));
    if (e.key === 'ArrowDown') return (e.preventDefault(), open ? setActive((a) => Math.min(a + 1, items.length - 1)) : setOpen(true));
    if (e.key === 'ArrowUp') return (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
    if (e.key === 'Enter' && open && items[active]) return (e.preventDefault(), pick(items[active]));
    if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={`${uid}-list`}
        aria-autocomplete="list"
        aria-label={rest['aria-label']}
        className="field !ps-10 !pe-10"
        placeholder={placeholder ?? t('common.searchPerson')}
        value={open ? term : value ? `${value.prenom} ${value.nom}` : ''}
        onFocus={() => (setActive(0), setOpen(true))}
        onChange={(e) => (setTerm(e.target.value), setActive(0), setOpen(true))}
        onKeyDown={onKey}
      />
      {value && (
        <button
          type="button"
          className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted hover:bg-glass-hover hover:text-fg"
          aria-label={t('common.clear')}
          onClick={() => (onChange(null), setTerm(''))}
        >
          <X size={14} />
        </button>
      )}
      {open && (
        <ul id={`${uid}-list`} role="listbox" className="glass-strong absolute inset-x-0 top-full z-40 mt-1.5 max-h-72 overflow-auto p-1.5">
          {q.isLoading ? (
            <li className="px-3 py-2 text-sm text-muted">…</li>
          ) : items.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">{t('common.noResult')}</li>
          ) : (
            items.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={p.id === value?.id}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                className={clsx(
                  'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm',
                  i === active && 'bg-glass text-fg',
                  p.id === value?.id && 'font-semibold text-accent',
                )}
              >
                <Avatar id={p.id} prenom={p.prenom} nom={p.nom} hasPhoto={!!p.photoFileId} size={28} />
                <span className="min-w-0 flex-1 truncate">
                  {p.prenom} {p.nom}
                  <span className="ms-2 text-xs text-muted">{[p.matricule, p.poste].filter(Boolean).join(' · ')}</span>
                </span>
                {p.id === value?.id && <Check size={14} aria-hidden />}
              </li>
            ))
          )}
          {more > 0 && <li className="px-3 pb-1 pt-2 text-xs text-subtle">{t('common.refineSearch', { count: more })}</li>}
        </ul>
      )}
    </div>
  );
}
