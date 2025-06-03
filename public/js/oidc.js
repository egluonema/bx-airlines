(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const baseUri = `${window.location.origin}/`;
    const currentVertical = window.location.pathname.split('/')[1];

    const redirectUri = `${baseUri}${currentVertical}/dashboard`;

    const clientOptions = {
      client_id: window._env_.BXI_REDIRECT_CLIENT_ID,
      redirect_uri: redirectUri,
    };

    const client = await pingOidc.OidcClient.initializeFromOpenIdConfig(
      window._env_.BXI_REDIRECT_ISSUER,
      clientOptions
    );

    const pathname = window.location.pathname.endsWith('/')
      ? window.location.pathname.slice(0, -1) // trim trailing slash
      : window.location.pathname;

    // On home page but we have a token, redirect to dashboard
    if (pathname === `/${currentVertical}` && (await client.hasToken())) {
      window.location.assign(redirectUri);
    }

    if (!window.location.pathname.includes('/dashboard')) {
      const loginBtn = document.getElementById('oidc-login');
      if (loginBtn) {
        loginBtn.removeAttribute('disabled');
        loginBtn.addEventListener('click', async () => {
          await client.authorize();
        });
      }
    } else {
      const logoutBtn = document.getElementById('oidc-logout');
      if (logoutBtn) {
        // Clear bxi.logout call, We don't need to clear the DV_ST cookie or redirect home, endSession does that for us
        logoutBtn.onclick = null;
        logoutBtn.addEventListener('click', async () => {
          await fetch(`/setVerticalCookie?currentVertical=${currentVertical}`);
          await client.endSession(baseUri);
        });
      }

      // On Dashboard page, in bxi we want to allow users to stay on the dashboard even if they are not authenticated so no redirect home if this hasToken is false
      if (await client.hasToken()) {
        let userInfo;

        try {
          userInfo = await client.fetchUserInfo();
        } catch (error) {
          console.error(
            'An error occurred attempting to fetch user info token is likely expired',
            error
          );
          const refreshedToken = await client.refreshToken();
          if (!refreshedToken) {
            return; // Library will redirect to authorization url
          } else {
            userInfo = await client.fetchUserInfo();
          }
        }

        bxi.updatedUserInfo(userInfo);
      }
    }
  });
})();
