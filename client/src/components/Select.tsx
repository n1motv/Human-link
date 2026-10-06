import {
  Children,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import i18n from 'i18next';
import { useNativeValue } from '../lib/useNativeValue';
import { Check, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

interface Opt {
  value: string;
  label: ReactNode;
  /** Libellé en texte brut, pour la recherche et la saisie rapide. */
  text: string;
  disabled: boolean;
}

/** Au-delà de ce nombre d'options, la liste s'ouvre avec un champ de recherche (choisir un manager parmi des dizaines de personnes). */
export const SEARCH_FROM = 8;

/** Texte d'un libellé JSX (« {prenom} {nom} » donne un tableau de morceaux). */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

/** Minuscules sans accents : « elena » trouve « Éléna ». */
const fold = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function readOptions(children: ReactNode): Opt[] {
  const out: Opt[] = [];
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    const p = c.props as { value?: string | number; children?: ReactNode; disabled?: boolean };
    if (c.type === 'option') {
      const label = p.children;
      out.push({ value: String(p.value ?? (typeof label === 'string' ? label : '')), label, text: textOf(label), disabled: !!p.disabled });
    } else if (p.children) {
      out.push(...readOptions(p.children)); // <optgroup> et fragments
    }
  });
  return out;
}

type Props = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; icon?: ReactNode };

/**
 * Menu déroulant au style du site. API compatible avec <select> (value/onChange/{...register()}) :
 * un <select> natif masqué reste la source de vérité, la liste affichée est personnalisée.
 */
export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { invalid, icon, className, children, disabled, onChange, onBlur, name, value, defaultValue, id, ...rest },
  ref,
) {
  const nativeRef = useRef<HTMLSelectElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => nativeRef.current as HTMLSelectElement);

  const uid = useId();
  const options = readOptions(children);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState('');
  const searchable = options.length > SEARCH_FROM;
  const shown = searchable && query.trim() ? options.filter((o) => fold(o.text).includes(fold(query.trim()))) : options;
  const [current, setCurrent] = useState('');
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0, up: false });

  // Valeur courante : lue sur le <select> natif (couvre contrôlé et react-hook-form).
  const sync = useCallback(() => setCurrent(nativeRef.current?.value ?? ''), []);
  useLayoutEffect(sync);
  useNativeValue(nativeRef, sync); // react-hook-form écrit dans le champ natif sans rendu (setValue, reset)

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const up = window.innerHeight - r.bottom < 260 && r.top > window.innerHeight - r.bottom;
    setPos({ left: r.left, top: up ? r.top : r.bottom, width: r.width, up });
  }, []);

  const show = () => {
    if (disabled) return;
    sync();
    setQuery('');
    const i = options.findIndex((o) => o.value === (nativeRef.current?.value ?? ''));
    setActive(Math.max(i, 0));
    place();
    setOpen(true);
  };

  const pick = (o: Opt) => {
    const el = nativeRef.current;
    if (!el || o.disabled) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(el, o.value);
    el.dispatchEvent(new Event('change', { bubbles: true })); // déclenche onChange React / RHF
    setCurrent(o.value);
    setOpen(false);
    btnRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !boxRef.current?.contains(t)) setOpen(false);
    };
    const close = (e: Event) => {
      if (e.target instanceof Node && boxRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', away);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus(); // la saisie part directement dans le filtre
  }, [open, searchable]);

  const move = (dir: 1 | -1) => {
    if (!shown.length) return;
    let i = Math.min(active, shown.length - 1);
    for (let n = 0; n < shown.length; n++) {
      i = (i + dir + shown.length) % shown.length;
      if (!shown[i]?.disabled) break;
    }
    setActive(i);
  };

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const inSearch = e.target === searchRef.current; // frappe dans le filtre : l'espace et les lettres lui appartiennent
    if (e.key === 'Tab') return setOpen(false);
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        show();
      } else if (searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        show();
        setQuery(e.key); // la première lettre tapée sur la liste fermée ouvre le filtre déjà rempli
      }
      return;
    }
    if (e.key === 'ArrowDown') (e.preventDefault(), move(1));
    else if (e.key === 'ArrowUp') (e.preventDefault(), move(-1));
    else if (e.key === 'Home') (e.preventDefault(), setActive(0));
    else if (e.key === 'End') (e.preventDefault(), setActive(shown.length - 1));
    else if (e.key === 'Enter' || (e.key === ' ' && !inSearch)) (e.preventDefault(), shown[active] && pick(shown[active]));
    else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), setOpen(false));
    else if (e.key.length === 1 && !inSearch) {
      const i = shown.findIndex((o) => fold(o.text).startsWith(fold(e.key)));
      if (i >= 0) setActive(i);
    }
  };

  const selected = options.find((o) => o.value === current) ?? options[0];
  const ariaLabel = rest['aria-label'];

  return (
    <div className="relative">
      <select
        ref={nativeRef}
        id={id}
        name={name}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        onChange={onChange}
        onBlur={onBlur}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        {...rest}
      >
        {children}
      </select>
      <button
        ref={btnRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${uid}-list`}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className={clsx('field flex items-center gap-2 text-start disabled:opacity-60', icon && '!ps-9', className)}
      >
        {icon && <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted">{icon}</span>}
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? ''}</span>
        <ChevronDown size={16} className={clsx('shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            ref={boxRef}
            style={{ left: pos.left, top: pos.top, minWidth: pos.width, transform: pos.up ? 'translateY(calc(-100% - 6px))' : 'translateY(6px)' }}
            className="glass-strong fixed z-[100] overflow-hidden"
          >
            {searchable && (
              <div className="border-b border-line p-1.5">
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKey}
                  placeholder={i18n.t('common.search')}
                  aria-label={i18n.t('common.search')}
                  aria-controls={`${uid}-list`}
                  aria-activedescendant={shown[active] ? `${uid}-opt-${active}` : undefined}
                  autoComplete="off"
                  className="field !py-2 text-sm"
                />
              </div>
            )}
            <ul ref={listRef} id={`${uid}-list`} role="listbox" className="max-h-64 overflow-auto p-1.5">
              {shown.map((o, i) => (
                <li
                  key={`${o.value}-${i}`}
                  id={`${uid}-opt-${i}`}
                  role="option"
                  aria-selected={o.value === current}
                  aria-disabled={o.disabled || undefined}
                  data-active={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                  className={clsx(
                    'flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm',
                    o.disabled && 'cursor-not-allowed opacity-45',
                    i === active && !o.disabled && 'bg-glass text-fg',
                    o.value === current && 'font-semibold text-accent',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.value === current && <Check size={14} aria-hidden />}
                </li>
              ))}
              {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted">{i18n.t('common.noResult')}</li>}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
});
