document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const btn = document.getElementById('btnLogin');

  const init = () => {
    const forgot = document.getElementById('forgotPasswordLink');
    if (forgot) {
      forgot.addEventListener('click', (e) => {
        e.preventDefault();
        toast({
          title: 'Forgot password',
          message: 'Password reset flow is not implemented in this UI yet. Use backend endpoint via Postman.',
          variant: 'warning',
        });
      });
    }
  };

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      try {
        setLoading(btn, true, 'Signing in...');
        const res = await loginUser({ email, password });

        const token = res?.token || res?.data?.token || res?.accessToken || res?.jwt || null;
        if (!token) {
          throw new Error('Login succeeded but token missing in response.');
        }

        setToken(token);
        toast({ title: 'Welcome!', message: 'Login successful.', variant: 'success' });

        // Redirect to profile/dashboard
        window.location.href = 'profile.html';


      } catch (err) {
        toast({ title: 'Login failed', message: err.message || 'Check credentials and try again.', variant: 'danger' });
      } finally {
        setLoading(btn, false);
      }
    });
  }

  init();
});

