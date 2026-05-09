document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  const btn = document.getElementById('btnRegister');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const role = document.getElementById('role').value;

      try {
        setLoading(btn, true, 'Creating...');
        const res = await registerUser({ name, email, password, role });

        const token = res?.token || res?.data?.token || res?.accessToken || res?.jwt || null;
        if (token) setToken(token);

        toast({
          title: 'Account created',
          message: token ? 'You are now logged in.' : 'Check email verification steps (if enabled by backend).',
          variant: 'success',
        });

        window.location.href = token ? 'profile.html' : 'auth-login.html';
      } catch (err) {
        toast({ title: 'Registration failed', message: err.message || 'Try again.', variant: 'danger' });
      } finally {
        setLoading(btn, false);
      }
    });
  }
});

