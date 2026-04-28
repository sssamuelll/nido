export type ToastVariant = 'success' | 'error' | 'info';

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: 'toast--success',
  error: 'toast--error',
  info: '',
};

let toastTimeout: number;

export function showToast(msg: string, variant: ToastVariant = 'info'): void {
  const el = document.getElementById('global-toast');
  const msgEl = document.getElementById('global-toast-msg');
  if (!el || !msgEl) return;
  msgEl.textContent = msg;
  el.classList.remove('toast--success', 'toast--error');
  if (VARIANT_CLASS[variant]) el.classList.add(VARIANT_CLASS[variant]);
  el.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => el.classList.remove('show'), 3000);
}
