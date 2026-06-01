import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// jsdom has no matchMedia; EmojiPicker (rendered inside the modal) needs it.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

// Render-level smoke test for the "Nuevo gasto fijo" modal after its paper
// restyle. No browser available in this environment, so this is the strongest
// feature-correctness evidence short of pixels: it proves the rewritten modal
// mounts without throwing and renders the new paper structure (eyebrow labels,
// Seg type toggle, FilterChip category picker, primary Guardar, no Cancelar).
// NOTE: src/components/** is excluded from `test:ci`; run locally via vitest.

vi.mock('../api', () => ({
  Api: {
    getRecurring: vi.fn().mockResolvedValue([]),
    getCurrentCycle: vi.fn().mockResolvedValue(null),
  },
}));

// Skip the async load (cacheBus/network) so the card renders synchronously.
vi.mock('../hooks/useResource', () => ({
  useAsyncEffect: () => ({ loading: false }),
}));

vi.mock('../hooks/useCategoryManagement', () => ({
  useCategoryManagement: () => ({
    categories: [
      { name: 'Vivienda', emoji: '🏠', color: '#9E4B43' },
      { name: 'Supermercado', emoji: '🛒', color: '#3D6B52' },
    ],
    getCategoryDef: () => undefined,
  }),
}));

import { RecurringSection } from './RecurringSection';

const openAddModal = () => {
  render(<RecurringSection userId={1} />);
  fireEvent.click(screen.getByText(/Añadir recurrente/));
};

afterEach(cleanup);

describe('RecurringSection — "Nuevo gasto fijo" modal (paper restyle)', () => {
  it('opens a paper dialog titled "Nuevo gasto fijo" with a circular close', () => {
    openAddModal();
    expect(screen.getByRole('dialog', { name: 'Nuevo gasto fijo' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Nuevo gasto fijo' })).toBeTruthy();
    expect(screen.getByLabelText('Cerrar')).toBeTruthy();
  });

  it('renders the paper field set: eyebrow labels, Seg toggle, FilterChip categories', () => {
    openAddModal();
    for (const label of ['Nombre', 'Importe', 'Tipo', 'Categoría', 'Notas', 'Se repite cada']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // Seg type toggle (CONTEXT_SEG_OPTIONS) — same control as the Nuevo gasto modal
    expect(screen.getByRole('button', { name: 'Compartido' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Personal' })).toBeTruthy();
    // Category chips + the "Más" affordance that replaced the .cmd-palette
    expect(screen.getByText('Vivienda')).toBeTruthy();
    expect(screen.getByText('Más')).toBeTruthy();
  });

  it('has a primary Guardar and no Cancelar; add mode hides Eliminar/Pausar', () => {
    openAddModal();
    expect(screen.getByRole('button', { name: /Guardar/ })).toBeTruthy();
    expect(screen.queryByText('Cancelar')).toBeNull();
    expect(screen.queryByText('Eliminar')).toBeNull();
    expect(screen.queryByText('Pausar')).toBeNull();
  });
});
