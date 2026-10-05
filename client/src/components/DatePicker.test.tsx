import { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Input } from './ui';
import { renderWithProviders } from '../test/utils';

// « Aujourd'hui » figé au lundi 5 octobre 2026 : les jours proposés sont donc toujours les mêmes.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-05T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

function Harness({ type, min, initial = '' }: { type: 'date' | 'month' | 'datetime-local'; min?: string; initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <Input type={type} aria-label="Date" min={min} value={v} onChange={(e) => setV(e.target.value)} />
      <output data-testid="valeur">{v}</output>
    </>
  );
}

const trigger = () => screen.getByRole('button', { name: 'Date' });
const value = () => screen.getByTestId('valeur').textContent;
const day = (iso: string) => document.querySelector<HTMLButtonElement>(`[data-iso="${iso}"]`)!;

describe('DatePicker (via <Input type="date|month|datetime-local">)', () => {
  it('remplace le champ natif : bouton lisible, calendrier au clic, valeur AAAA-MM-JJ renvoyée à onChange', () => {
    renderWithProviders(<Harness type="date" />);
    expect(trigger().textContent).toMatch(/Choisir une date/);
    fireEvent.click(trigger());
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(day('2026-10-12'));
    expect(value()).toBe('2026-10-12');
    expect(screen.queryByRole('dialog')).toBeNull(); // se ferme après le choix
    expect(trigger().textContent).toMatch(/12 oct\. 2026/);
  });

  it('affiche octobre 2026, entoure aujourd’hui et grise les jours avant la date minimale', () => {
    renderWithProviders(<Harness type="date" min="2026-10-10" />);
    fireEvent.click(trigger());
    expect(screen.getByRole('button', { name: /octobre 2026/i })).toBeTruthy();
    expect(day('2026-10-05').getAttribute('data-today')).toBe('true');
    expect(day('2026-10-09').disabled).toBe(true);
    expect(day('2026-10-10').disabled).toBe(false);
    fireEvent.click(day('2026-10-09')); // un jour interdit ne change rien
    expect(value()).toBe('');
  });

  it('change de mois avec les flèches', () => {
    renderWithProviders(<Harness type="date" />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.getByRole('button', { name: /novembre 2026/i })).toBeTruthy();
    fireEvent.click(day('2026-11-03'));
    expect(value()).toBe('2026-11-03');
  });

  it('mode mois : grille des 12 mois, valeur AAAA-MM', () => {
    renderWithProviders(<Harness type="month" initial="2026-10" />);
    expect(trigger().textContent).toMatch(/octobre 2026/i);
    fireEvent.click(trigger());
    expect(screen.getAllByRole('button', { name: /^(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)\.?$/i }).length).toBeGreaterThanOrEqual(12);
    fireEvent.click(screen.getByRole('button', { name: /^nov\.?$/i }));
    expect(value()).toBe('2026-11');
  });

  it('« Effacer » vide la valeur', () => {
    renderWithProviders(<Harness type="date" initial="2026-10-20" />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('button', { name: 'Effacer' }));
    expect(value()).toBe('');
  });

  it('Échap ferme le calendrier', () => {
    renderWithProviders(<Harness type="date" />);
    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
