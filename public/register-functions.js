function registerFunctions(logger) {
  /**
   * Add custom code here to do any page load actions, called on body tag in onload=""
   */
  bxi.pageLoad = () => {
    // Page load set up code here

    // Set the username container on the dashboard page to whatever is in sessionStorage
    const usernameContainer = document.getElementById('username-container');
    const idToken = bxi.getIdToken();

    const base64Fragment = idToken?.split('.')?.[1] || null;

    if (base64Fragment) {
      const decodedFragment = JSON.parse(atob(base64Fragment));

      // You can customize which id_token attribute you want to display here
      const username =
        decodedFragment['given_name'] || decodedFragment['email'];

      if (usernameContainer && username) {
        logger.log(
          `username found in ID Token and a container was found, '${username}' will be displayed`
        );
        usernameContainer.textContent = username;
      }
    }
  };

  /**
   * Add custom code here to do any logout teardown you need to do, called when Log Out is clicked
   */
  bxi.logout = async () => {
    // Tear-down code here

    // Change this to sessionStorage.clear() if you'd like to remove everything
    sessionStorage.removeItem('bxi_accessToken');
    sessionStorage.removeItem('bxi_idToken');

    logger.log(
      'Logout occured, username has been cleared from session storage if it existed'
    );

    await fetch('/logout');

    // This call should be last
    window.location.assign(`/${window.location.pathname.split('/')[1]}`);
  };

  bxi.getAccessToken = () => {
    return sessionStorage.getItem('bxi_accessToken');
  };

  bxi.getIdToken = () => {
    return sessionStorage.getItem('bxi_idToken');
  };

  /** Called after user info is retreived from OIDC SDK, can update dashboard with user information here if desired */
  bxi.updatedUserInfo = (userInfo) => {
    logger.log('Received user info', userInfo);
    const usernameContainer = document.getElementById('username-container');
    const displayName = userInfo.given_name || userInfo.preferred_username;
    if (usernameContainer && displayName) {
      usernameContainer.textContent = displayName;
    }
  };

  /**
   * You may register functions that you would like to hook into during flow execution here. Functions are called by name passed in the
   * associated data attribute (e.g. data-success-callback="loginSuccess")
   *
   * Please note you can pass in a named function (e.g. bxi.registerFunction(function loginSuccess(res) {...}); )
   * or you may pass in a name as string with an anonymous function (e.g. bxi.registerFunction('loginSuccess', (res) => {...}); )
   * Function calls are awaited so async functions and promises are supported!
   *
   * We provided this file as a centralized location for registering callbacks, however it is purposely exposed on the window.bxi object
   * so you may register callbacks anywhere in your application as long as it's after bxi-davinci.js is loaded (initFunctionRegistry() has been called)
   */

  bxi.registerFunction('remixParameters', async () => {
    const verticals = await fetch('/verticals');
    const verticalsParam = (await verticals.json()).map((v) => ({
      name: v.charAt(0).toUpperCase() + v.slice(1),
      value: v,
    }));
    return {
      CurrentVertical: window.location.pathname.split('/')[1],
      Verticals: verticalsParam,
    };
  });

  bxi.registerFunction('defaultAuthnSuccess', async (response) => {
    logger.log('defaultAuthnSuccess called with DV response', response);

    // If your access_token is somewhere else in the DV response you can change that here
    const accessToken = response.access_token;
    if (accessToken) {
      logger.log('access_token found in response, storing in sessionStorage');
      sessionStorage.setItem('bxi_accessToken', accessToken);
    }

    // If your id_token is somewhere else in your DV response you can change that here
    const idToken = response.id_token;
    if (idToken) {
      logger.log('id_token found in response, storing in sessionStorage');
      sessionStorage.setItem('bxi_idToken', idToken);

      // Generic vertical doesn't have a dashboard page
      if (!window.location.pathname.includes('generic')) {
        // If we have an ID token, we can be considered logged in and redirected to the dashboard
        window.location.assign(window.location.pathname + '/dashboard');
      }
    }
  });

  bxi.registerFunction('logout', async (response) => {
    if (response.additionalProperties?.staleSession) {
      await bxi.logout();
    }
  });
}

// This function is executed in bxi-davinci.js after the function registry is initialized
export default registerFunctions;
