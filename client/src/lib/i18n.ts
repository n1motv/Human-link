import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from '../locales/fr.json';

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

/**
 * Seul le français (langue de repli) est embarqué dans le paquet principal. Les autres langues sont des fichiers séparés,
 * téléchargés à la demande : on ne charge que la langue de la personne, puis une autre si elle en change.
 */
const LOADERS: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => import('../locales/en.json'),
  ar: () => import('../locales/ar.json'),
  es: () => import('../locales/es.json'),
  it: () => import('../locales/it.json'),
};

async function loadBundle(lng: string): Promise<Record<string, unknown> | undefined> {
  return lng === 'fr' ? undefined : (await LOADERS[lng]?.())?.default;
}

/** Change de langue en chargeant d'abord ses traductions : l'interface ne passe jamais par un état à moitié traduit. */
export async function changeLanguage(lng: string) {
  if (!i18n.hasResourceBundle(lng, 'translation')) {
    const bundle = await loadBundle(lng);
    if (bundle) i18n.addResourceBundle(lng, 'translation', bundle);
  }
  await i18n.changeLanguage(lng);
}

export async function initI18n(defaultLang: string, allowed: string[]) {
  const stored = read();
  const lng = stored && allowed.includes(stored) ? stored : allowed.includes(defaultLang) ? defaultLang : 'fr';
  const bundle = lng === 'fr' ? undefined : await loadBundle(lng); // pour le français, aucune attente : l'initialisation reste synchrone
  void i18n.use(initReactI18next).init({
    resources: { fr: { translation: fr }, ...(bundle ? { [lng]: { translation: bundle } } : {}) },
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
