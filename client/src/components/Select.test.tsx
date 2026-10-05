import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
