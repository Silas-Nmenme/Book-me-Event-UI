document.addEventListener('DOMContentLoaded', () => {
  // Landing CTA behavior
  // - If user is logged in, send to profile/dashboard.
  // - Otherwise, direct to register.
  // - Also update header/nav buttons to show correct actions.

  const navAuthLink = document.getElementById('navAuthLink');

  function getToken() {
    return localStorage.getItem('bme_token') || '';
  }

  function goTo(path) {
    window.location.href = path;
  }

  function setAuthCTA() {
    const token = getToken();
    if (navAuthLink) {
      if (token) {
        navAuthLink.href = 'profile.html';
        navAuthLink.textContent = 'Dashboard';
      } else {
        navAuthLink.href = 'auth-login.html';
        navAuthLink.textContent = 'Login';
      }
    }

    // Make main CTA buttons consistent.
    const primary = document.getElementById('ctaExplore');
    const joinOrganizer = document.getElementById('ctaJoinOrganizer');
    const vendorKyc = document.getElementById('ctaVendorKyc');

    if (primary) {
      primary.addEventListener('click', (e) => {
        e.preventDefault();
        if (token) goTo('services.html');
        else goTo('auth-register.html');
      });
    }

    if (joinOrganizer) {
      joinOrganizer.addEventListener('click', (e) => {
        e.preventDefault();
        if (token) goTo('services.html');
        else goTo('auth-register.html');
      });
    }

    if (vendorKyc) {
      vendorKyc.addEventListener('click', (e) => {
        e.preventDefault();
        if (token) goTo('vendor-kyc.html');
        else goTo('auth-login.html');
      });
    }
  }

  setAuthCTA();
});

