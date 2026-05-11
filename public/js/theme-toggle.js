const THEME_KEY = 'bme_theme';

function getPreferredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  return prefersDark ? 'dark' : 'light';
}

export function setTheme(theme) {
  const t = theme === 'dark' || theme === 'light' ? theme : getPreferredTheme();
  document.documentElement.dataset.theme = t;
  localStorage.setItem(THEME_KEY, t);
  updateToggleIcon(t);
}

function updateToggleIcon(theme) {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const isDark = theme === 'dark';
  const sun = btn.querySelector('[data-icon="sun"]');
  const moon = btn.querySelector('[data-icon="moon"]');
  if (sun) sun.style.display = isDark ? 'none' : 'inline-flex';
  if (moon) moon.style.display = isDark ? 'inline-flex' : 'none';
}

export function initThemeToggle() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'dark';
    setTheme(current === 'dark' ? 'light' : 'dark');
  });

  setTheme(getPreferredTheme());
}

