export type ToastVariant = 'success' | 'error' | 'info';

// Every variant gets its own class so the icon shown inside .toast-icon
// can be selected purely from CSS (declarative, no innerHTML swap). The
// icon SVGs live in App.tsx and are toggled via .toast--success, .toast--error,
// .toast--info selectors.
const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: 'toast--success',
  error: 'toast--error',
  info: 'toast--info',
};

let toastTimeout: number;

export function showToast(msg: string, variant: ToastVariant = 'info'): void {
  const el = document.getElementById('global-toast');
  const msgEl = document.getElementById('global-toast-msg');
  if (!el || !msgEl) return;
  msgEl.textContent = msg;
  el.classList.remove('toast--success', 'toast--error', 'toast--info');
  el.classList.add(VARIANT_CLASS[variant]);
  el.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => el.classList.remove('show'), 3000);
}
