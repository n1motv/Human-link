import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OtpInput, type OtpStatus } from './OtpInput';

const boxes = () => screen.getAllByRole('textbox') as HTMLInputElement[];

function Harness({ status = 'idle', onComplete, onSettle }: { status?: OtpStatus; onComplete?: (v: string) => void; onSettle?: () => void }) {
  const [value, setValue] = useState('');
  return <OtpInput label="Code" value={value} status={status} onChange={setValue} onComplete={onComplete} onSettle={onSettle} />;
}

describe('OtpInput', () => {
  it('affiche 6 cases et avance au fil de la saisie, puis valide dès le 6e chiffre', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    expect(boxes()).toHaveLength(6);
    '12345'.split('').forEach((d, i) => fireEvent.change(boxes()[i]!, { target: { value: d } }));
    expect(boxes().map((b) => b.value).join('')).toBe('12345');
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.change(boxes()[5]!, { target: { value: '6' } });
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('ignore les caractères qui ne sont pas des chiffres', () => {
    render(<Harness />);
    fireEvent.change(boxes()[0]!, { target: { value: 'a' } });
    expect(boxes()[0]!.value).toBe('');
  });

  it('accepte le collage d’un code complet, même avec des espaces', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    fireEvent.paste(boxes()[0]!, { clipboardData: { getData: () => ' 654 321 ' } });
    expect(boxes().map((b) => b.value).join('')).toBe('654321');
    expect(onComplete).toHaveBeenCalledWith('654321');
  });

  it('Retour arrière efface la case courante, puis revient à la précédente', () => {
    render(<Harness />);
    '12'.split('').forEach((d, i) => fireEvent.change(boxes()[i]!, { target: { value: d } }));
    fireEvent.keyDown(boxes()[1]!, { key: 'Backspace' });
    expect(boxes().map((b) => b.value).join('')).toBe('1');
    fireEvent.keyDown(boxes()[1]!, { key: 'Backspace' });
    expect(boxes().map((b) => b.value).join('')).toBe('');
  });

  it('code bon : les cases fusionnent en une case verte avec une coche', () => {
    const { container } = render(<Harness status="success" />);
    expect(screen.getByLabelText('OK')).toBeTruthy();
    expect(container.querySelectorAll('.otp-box-merged')).toHaveLength(6);
    expect(boxes().every((b) => b.disabled)).toBe(true); // plus de saisie possible
  });

  it('code faux : fusion en case rouge avec une croix, puis réouverture et appel de onSettle', async () => {
    const onSettle = vi.fn();
    const { container } = render(<Harness status="error" onSettle={onSettle} />);
    expect(screen.getByLabelText('Error')).toBeTruthy();
    expect(container.querySelectorAll('.otp-box-merged')).toHaveLength(6);
    await waitFor(() => expect(onSettle).toHaveBeenCalledTimes(1), { timeout: 2500 });
    expect(container.querySelectorAll('.otp-box-merged')).toHaveLength(0);
  });

  it('verrouille la saisie pendant la vérification', () => {
    render(<Harness status="checking" />);
    expect(boxes().every((b) => b.disabled)).toBe(true);
  });
});
