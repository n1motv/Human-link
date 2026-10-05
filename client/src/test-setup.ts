import '@testing-library/react';

// jsdom n'implémente pas ces API du navigateur ; l'interface les appelle (défilement, thème système).
Element.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
