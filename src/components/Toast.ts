let toastTimeout: number;
export function showToast(msg: string) {
  const el = document.getElementById('global-toast');
  const msgEl = document.getElementById('global-toast-msg');
  if (!el || !msgEl) return;
  msgEl.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => el.classList.remove('show'), 3000);
}
