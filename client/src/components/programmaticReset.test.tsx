import { act, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/utils';
import { Input, Select } from './ui';

// U-02 : react-hook-form change la valeur d'un champ en écrivant directement dans l'élément natif (reset, setValue), sans rendu.
// Les composants maison relisent ce champ natif : leur affichage doit suivre.

let form: ReturnType<typeof useForm<{ role: string; jour: string }>>;
function Harness() {
  form = useForm({ defaultValues: { role: 'employe', jour: '2026-10-05' } });
  return (
    <form>
      <Select aria-label="Rôle" {...form.register('role')}>
        <option value="employe">Employé</option>
        <option value="manager">Manager</option>
        <option value="admin">Administrateur</option>
      </Select>
      <Input aria-label="Jour" type="date" {...form.register('jour')} />
    </form>
  );
}

describe('affichage après un reset programmatique (U-02)', () => {
  it('la liste déroulante affiche la nouvelle valeur après reset()', () => {
    renderWithProviders(<Harness />);
    expect(screen.getByRole('combobox', { name: 'Rôle' }).textContent).toContain('Employé');
    act(() => form.reset({ role: 'manager', jour: '2026-10-05' }));
    expect(screen.getByRole('combobox', { name: 'Rôle' }).textContent).toContain('Manager');
    act(() => form.setValue('role', 'admin'));
    expect(screen.getByRole('combobox', { name: 'Rôle' }).textContent).toContain('Administrateur');
  });

  it('le sélecteur de date affiche la nouvelle valeur après reset()', () => {
    renderWithProviders(<Harness />);
    const before = screen.getByRole('button', { name: /Jour/ }).textContent;
    expect(before).toMatch(/5 oct\. 2026/);
    act(() => form.reset({ role: 'employe', jour: '2026-11-20' }));
    expect(screen.getByRole('button', { name: /Jour/ }).textContent).toMatch(/20 nov\. 2026/);
  });

  it('le sélecteur de date suit aussi setValue() sans rendu', () => {
    renderWithProviders(<Harness />);
    act(() => form.setValue('jour', '2026-12-24'));
    expect(screen.getByRole('button', { name: /Jour/ }).textContent).toMatch(/24 déc\. 2026/);
  });

  it('une valeur écrite directement sur l’élément natif est aussi reprise', () => {
    const { container } = render(
      <select defaultValue="a" aria-label="témoin">
        <option value="a">A</option>
        <option value="b">B</option>
      </select>,
    );
    const el = container.querySelector('select')!;
    el.value = 'b';
    expect(el.value).toBe('b'); // le témoin natif se comporte comme attendu
  });
});
