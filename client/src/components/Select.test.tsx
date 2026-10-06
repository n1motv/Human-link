import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initI18n } from '../lib/i18n';
import { Select } from './Select';

function Harness({ onChange, initial = 'a' }: { onChange?: (v: string) => void; initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <Select
        aria-label="Rôle"
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          onChange?.(e.target.value);
        }}
      >
        <option value="a">Administrateur</option>
        <option value="b">Manager</option>
        <option value="c" disabled>
          Interdit
        </option>
        <option value="d">Employé</option>
      </Select>
      <output data-testid="valeur">{v}</output>
    </>
  );
}

const trigger = () => screen.getByRole('combobox', { name: 'Rôle' });

describe('Select', () => {
  it('affiche le libellé de l’option choisie et garde un <select> natif masqué comme source de vérité', () => {
    const { container } = render(<Harness initial="b" />);
    expect(trigger().textContent).toContain('Manager');
    const native = container.querySelector('select')!;
    expect(native.value).toBe('b');
    expect(native.getAttribute('aria-hidden')).toBe('true');
  });

  it('ouvre la liste, choisit une option à la souris et prévient avec la nouvelle valeur', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(trigger());
    expect(screen.getAllByRole('option')).toHaveLength(4);
    fireEvent.click(screen.getByRole('option', { name: /Employé/ }));
    expect(onChange).toHaveBeenCalledWith('d');
    expect(screen.getByTestId('valeur').textContent).toBe('d');
    expect(screen.queryByRole('listbox')).toBeNull(); // la liste se ferme
    expect(trigger().textContent).toContain('Employé');
  });

  it('marque l’option courante et ne permet pas de choisir une option désactivée', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    expect(screen.getByRole('option', { name: /Administrateur/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('option', { name: /Interdit/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('se pilote au clavier : flèches (en sautant l’option désactivée), Entrée, Échap', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' }); // ouvre
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' }); // Administrateur → Manager
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' }); // saute « Interdit » → Employé
    fireEvent.keyDown(trigger(), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('d');

    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(trigger(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('se ferme au clic en dehors', () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('Select avec recherche (U-01)', () => {
  beforeAll(() => {
    void initI18n('fr', ['fr']);
  });

  const NAMES = ['Éléna Martin', 'Sofia Lopez', 'Luca Rossi', 'Nadia Haddad', 'Karim Bernard', 'Claire Petit', 'Thomas Dubois', 'Emma Roux', 'Hugo Lambert', 'Julie Garnier'];
  function Many({ count = NAMES.length, onChange }: { count?: number; onChange?: (v: string) => void }) {
    const [v, setV] = useState('');
    return (
      <Select
        aria-label="Manager"
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          onChange?.(e.target.value);
        }}
      >
        <option value="">—</option>
        {NAMES.slice(0, count).map((n) => (
          <option key={n} value={n}>
            {n.split(' ')[0]} {n.split(' ')[1]}
          </option>
        ))}
      </Select>
    );
  }
  const manager = () => screen.getByRole('combobox', { name: 'Manager' });
  const search = () => screen.getByRole('searchbox');

  it('n’ajoute pas de champ de recherche pour une courte liste', () => {
    render(<Many count={5} />);
    fireEvent.click(manager());
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('ajoute un champ de recherche au-delà de 8 options, déjà sélectionné', () => {
    render(<Many />);
    fireEvent.click(manager());
    expect(document.activeElement).toBe(search());
    expect(screen.getAllByRole('option')).toHaveLength(NAMES.length + 1);
  });

  it('filtre au fil de la frappe, sans tenir compte des majuscules ni des accents', () => {
    render(<Many />);
    fireEvent.click(manager());
    fireEvent.change(search(), { target: { value: 'ELENA' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Éléna Martin']);
    fireEvent.change(search(), { target: { value: 'a' } });
    expect(screen.getAllByRole('option').length).toBeGreaterThan(3);
    fireEvent.change(search(), { target: { value: 'zzz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('Aucun résultat')).toBeTruthy();
  });

  it('se choisit au clavier : flèches puis Entrée, l’espace reste une lettre du filtre', () => {
    const onChange = vi.fn();
    render(<Many onChange={onChange} />);
    fireEvent.click(manager());
    fireEvent.change(search(), { target: { value: 'sofia l' } });
    fireEvent.keyDown(search(), { key: ' ' }); // ne choisit rien : on est en train de taper
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('Sofia Lopez');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('une lettre tapée sur la liste fermée l’ouvre avec le filtre rempli', () => {
    render(<Many />);
    fireEvent.keyDown(manager(), { key: 'k' });
    expect((search() as HTMLInputElement).value).toBe('k');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Karim Bernard']);
  });

  it('chaque ouverture repart d’un filtre vide', () => {
    render(<Many />);
    fireEvent.click(manager());
    fireEvent.change(search(), { target: { value: 'luca' } });
    fireEvent.keyDown(search(), { key: 'Escape' });
    fireEvent.click(manager());
    expect((search() as HTMLInputElement).value).toBe('');
    expect(screen.getAllByRole('option')).toHaveLength(NAMES.length + 1);
  });
});
