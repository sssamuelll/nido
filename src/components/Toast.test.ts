/// <reference lib="dom" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showToast } from './Toast';

describe('showToast', () => {
  let toastEl: HTMLDivElement;
  let msgEl: HTMLSpanElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    toastEl = document.createElement('div');
    toastEl.id = 'global-toast';
    toastEl.className = 'toast';
    msgEl = document.createElement('span');
    msgEl.id = 'global-toast-msg';
    toastEl.appendChild(msgEl);
    document.body.appendChild(toastEl);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies toast--success and removes other variant classes', () => {
    toastEl.classList.add('toast--error', 'toast--info');
    showToast('Saved', 'success');
    expect(toastEl.classList.contains('toast--success')).toBe(true);
    expect(toastEl.classList.contains('toast--error')).toBe(false);
    expect(toastEl.classList.contains('toast--info')).toBe(false);
    expect(toastEl.classList.contains('show')).toBe(true);
    expect(msgEl.textContent).toBe('Saved');
  });

  it('applies toast--error variant class (regression: was previously absent on error path)', () => {
    showToast('Error al guardar', 'error');
    expect(toastEl.classList.contains('toast--error')).toBe(true);
    expect(toastEl.classList.contains('toast--success')).toBe(false);
  });

  it('applies toast--info as an explicit class (default variant)', () => {
    showToast('Heads up');
    expect(toastEl.classList.contains('toast--info')).toBe(true);
    expect(toastEl.classList.contains('toast--success')).toBe(false);
    expect(toastEl.classList.contains('toast--error')).toBe(false);
  });

  it('hides the toast after 3 seconds', () => {
    showToast('x', 'success');
    expect(toastEl.classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(toastEl.classList.contains('show')).toBe(false);
  });
});
