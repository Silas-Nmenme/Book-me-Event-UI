export function initLandingHeaderDetailsToggle() {
  const toggles = document.querySelectorAll('[data-header-details-toggle]');
  if (!toggles.length) return;

  toggles.forEach((toggle) => {
    const targetId = toggle.getAttribute('aria-controls');
    const target = targetId ? document.getElementById(targetId) : null;
    if (!target) return;

    // Ensure initial state
    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
    if (isExpanded) {
      target.hidden = false;
    } else {
      target.hidden = true;
    }

    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      target.hidden = expanded;
    });
  });
}

