import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

vi.mock('../components/Toast', () => ({
  showToast: vi.fn(),
}));

import { handleApiError } from './handleApiError';
import { showToast } from '../components/Toast';

describe('handleApiError', () => {
  let consoleErrorSpy: MockInstance<Parameters<typeof console.error>, ReturnType<typeof console.error>>;

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

  describe('with { silent: true }', () => {
    it('logs to console but does not surface a toast', () => {
      handleApiError(new Error('background fail'), 'Error al cargar ciclos', { silent: true });
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error al cargar ciclos', expect.any(Error));
      expect(showToast).not.toHaveBeenCalled();
    });

    it('does not toast even when err has a useful message', () => {
      handleApiError(new Error('Server is down'), 'Error al cargar', { silent: true });
      expect(showToast).not.toHaveBeenCalled();
    });
  });

  describe('with { silent: false } (explicit default)', () => {
    it('behaves like the default (toast + log)', () => {
      handleApiError(new Error('user click failed'), 'Error al guardar', { silent: false });
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error al guardar', expect.any(Error));
      expect(showToast).toHaveBeenCalledWith('user click failed', 'error');
    });
  });
});
