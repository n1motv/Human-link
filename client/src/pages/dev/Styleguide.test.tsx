import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import Styleguide from './Styleguide';

describe('Styleguide (Q-14)', () => {
  it('montre les composants dans les deux thèmes, côte à côte', () => {
    const { container } = renderWithProviders(<Styleguide />);
    const panels = container.querySelectorAll('[data-theme]');
    expect([...panels].map((p) => p.getAttribute('data-theme'))).toEqual(['dark', 'light']);
    for (const panel of panels) {
      const p = within(panel as HTMLElement);
      expect(p.getByText('Variantes')).toBeTruthy();
      expect(p.getByRole('button', { name: 'Danger' })).toBeTruthy();
      expect(p.getByText('Code 2FA (cases qui fusionnent)')).toBeTruthy();
      expect(p.getAllByRole('combobox').length).toBeGreaterThan(2); // listes déroulantes
    }
    expect(screen.getAllByText(/Validé|Accepté|Approuvé/i).length).toBeGreaterThan(0);
  });
});
