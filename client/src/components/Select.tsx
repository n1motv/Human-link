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
import { Check, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

interface Opt {
  value: string;
  label: ReactNode;
  disabled: boolean;
}

function readOptions(children: ReactNode): Opt[] {
  const out: Opt[] = [];
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    const p = c.props as { value?: string | number; children?: ReactNode; disabled?: boolean };
    if (c.type === 'option') {
      const label = p.children;
      out.push({ value: String(p.value ?? (typeof label === 'string' ? label : '')), label, disabled: !!p.disabled });
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
export const Select = forwardRef<HTMLSelectElement, Props>(function Select({ invalid, icon, className, children, disabled, onChange, onBlur, name, value, defaultValue, id, ...rest }, ref) {
  const nativeRef = useRef<HTMLSelectElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useImperativeHandle(ref, () => nativeRef.current as HTMLSelectElement);

  const uid = useId();
  const options = readOptions(children);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [current, setCurrent] = useState('');
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0, up: false });

  // Valeur courante : lue sur le <select> natif (couvre contrôlé et react-hook-form).
  const sync = useCallback(() => setCurrent(nativeRef.current?.value ?? ''), []);
  useLayoutEffect(sync);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const up = window.innerHeight - r.bottom < 260 && r.top > window.innerHeight - r.bottom;
    setPos({ left: r.left, top: up ? r.top : r.bottom, width: r.width, up });
  }, []);

  const show = () => {
    if (disabled) return;
    sync();
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
      if (!btnRef.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false);
    };
    const close = (e: Event) => {
      if (e.target instanceof Node && listRef.current?.contains(e.target)) return;
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

  const move = (dir: 1 | -1) => {
    let i = active;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i]?.disabled) break;
    }
    setActive(i);
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Tab') return setOpen(false);
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === 'ArrowDown') (e.preventDefault(), move(1));
    else if (e.key === 'ArrowUp') (e.preventDefault(), move(-1));
    else if (e.key === 'Home') (e.preventDefault(), setActive(0));
    else if (e.key === 'End') (e.preventDefault(), setActive(options.length - 1));
    else if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), options[active] && pick(options[active]));
    else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), setOpen(false));
    else if (e.key.length === 1) {
      const i = options.findIndex((o) => typeof o.label === 'string' && o.label.toLowerCase().startsWith(e.key.toLowerCase()));
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
          <ul
            ref={listRef}
            id={`${uid}-list`}
            role="listbox"
            style={{ left: pos.left, top: pos.top, minWidth: pos.width, transform: pos.up ? 'translateY(calc(-100% - 6px))' : 'translateY(6px)' }}
            className="glass-strong fixed z-[100] max-h-64 overflow-auto p-1.5"
          >
            {options.map((o, i) => (
              <li
                key={`${o.value}-${i}`}
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
          </ul>,
          document.body,
        )}
    </div>
  );
});
