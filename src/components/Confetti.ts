export function launchConfetti() {
  const container = document.getElementById('confetti-container');
  if (!container) return;
  const colors = ['#34D399', '#60A5FA', '#A78BFA', '#FBBF24', '#F87171', '#fff'];
  for (let i = 0; i < 50; i++) {
    const p = document.createElement('div');
    p.className = 'confetti';
    p.style.left = Math.random() * 100 + '%';
    p.style.top = '-10px';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDelay = Math.random() * 0.5 + 's';
    p.style.animationDuration = (2 + Math.random() * 2) + 's';
    p.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
    if (Math.random() > 0.5) { p.style.width = '6px'; p.style.height = '12px'; }
    container.appendChild(p);
    setTimeout(() => p.remove(), 4000);
  }
}
