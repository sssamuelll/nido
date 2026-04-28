import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../components/Toast', () => ({
  showToast: vi.fn(),
}));

import { handleApiError } from './handleApiError';
import { showToast } from '../components/Toast';

describe('handleApiError', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(showToast).mockClear();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('shows err.message when the error has a useful message', () => {
    handleApiError(new Error('Categoría no válida'), 'Error al guardar');
    expect(showToast).toHaveBeenCalledWith('Categoría no válida', 'error');
  });

  it('shows fallback when error has empty message', () => {
    handleApiError(new Error(''), 'Error al guardar');
    expect(showToast).toHaveBeenCalledWith('Error al guardar', 'error');
  });

  it('shows fallback when value is not an Error', () => {
    handleApiError('something weird', 'Error al guardar');
    expect(showToast).toHaveBeenCalledWith('Error al guardar', 'error');
  });

  it('shows fallback when value is undefined', () => {
    handleApiError(undefined, 'Error al guardar');
    expect(showToast).toHaveBeenCalledWith('Error al guardar', 'error');
  });

  it('always logs to console.error with the fallback as context', () => {
    handleApiError(new Error('boom'), 'Error al guardar');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error al guardar', expect.any(Error));
  });
});
