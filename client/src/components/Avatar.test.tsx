import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, photoSize } from './Avatar';

describe('Avatar (P-12)', () => {
  it('demande la plus petite miniature qui suffit à l’affichage', () => {
    expect(photoSize(24)).toBe('sm');
    expect(photoSize(48)).toBe('sm');
    expect(photoSize(80)).toBe('md');
    expect(photoSize(128)).toBe('md');
    expect(photoSize(200)).toBe('full');
  });

  it('charge la miniature dans l’image et montre les initiales sans photo', () => {
    const { container, rerender } = render(<Avatar id="u1" prenom="Sofia" nom="Lopez" hasPhoto size={36} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/api/users/u1/photo?size=sm');
    rerender(<Avatar id="u1" prenom="Sofia" nom="Lopez" size={36} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('SL');
  });
});
