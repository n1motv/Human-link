import { useEffect, type RefObject } from 'react';

/**
 * Prévient le composant quand la valeur de son champ natif est changée par programme (`el.value = …`).
 *
 * Select et DatePicker affichent leur propre interface et gardent un champ natif masqué comme source de vérité (compatible
 * react-hook-form). Mais react-hook-form écrit directement dans ce champ pour `setValue()` et `reset()`, sans déclencher de rendu :
 * sans cette écoute, l'affichage garderait l'ancienne valeur (U-02). On enveloppe l'accesseur `value` de l'élément, en conservant
 * celui que React y a éventuellement posé pour suivre les changements : rien d'autre ne change.
 */
export function useNativeValue(ref: RefObject<HTMLInputElement | HTMLSelectElement | null>, onProgrammaticChange: () => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const own = Object.getOwnPropertyDescriptor(el, 'value'); // accesseur posé par React pour suivre les changements, s'il y en a un
    const inherited = own ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    if (!inherited?.get || !inherited.set) return;
    Object.defineProperty(el, 'value', {
      configurable: true,
      enumerable: inherited.enumerable,
      get() {
        return inherited.get!.call(this);
      },
      set(v: string) {
        inherited.set!.call(this, v);
        onProgrammaticChange();
      },
    });
    return () => {
      if (own) Object.defineProperty(el, 'value', own);
      else delete (el as { value?: unknown }).value; // retombe sur l'accesseur du prototype
    };
  }, [ref, onProgrammaticChange]);
}
