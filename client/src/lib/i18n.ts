import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from '../locales/fr.json';
import en from '../locales/en.json';
import ar from '../locales/ar.json';
import es from '../locales/es.json';
import it from '../locales/it.json';

/** Noms de langues affichés dans leur propre langue. */
export const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'Français',
  en: 'English',
  ar: 'العربية',
  es: 'Español',
  it: 'Italiano',
};
export const RTL = new Set(['ar']);

const KEY = 'hl_lang';
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export function initI18n(defaultLang: string, allowed: string[]) {
  const stored = read();
  const lng = stored && allowed.includes(stored) ? stored : allowed.includes(defaultLang) ? defaultLang : 'fr';
  void i18n.use(initReactI18next).init({
    resources: { fr: { translation: fr }, en: { translation: en }, ar: { translation: ar }, es: { translation: es }, it: { translation: it } },
    lng,
    fallbackLng: 'fr', // toute clé non traduite s'affiche en français plutôt que vide
    interpolation: { escapeValue: false }, // React échappe déjà
    returnNull: false,
  });
  applyDirection(lng);
  i18n.on('languageChanged', (l) => {
    applyDirection(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* stockage indisponible */
    }
  });
}

function applyDirection(lng: string) {
  document.documentElement.lang = lng;
  document.documentElement.dir = RTL.has(lng) ? 'rtl' : 'ltr';
}

export default i18n;
