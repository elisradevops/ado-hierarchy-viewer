import '@testing-library/jest-dom';

// jsdom has no matchMedia implementation. Default to `matches: false` (wide
// viewport) so components that call useIsNarrowViewport (HierarchyToolbar,
// AppLayout) don't throw, and existing tests written against the wide-viewport
// layout keep passing unchanged. Individual tests can override this per-case
// (see HierarchyToolbar.test.tsx's narrow-viewport describe block).
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
