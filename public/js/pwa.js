(() => {
  const dismissedBannerKey = 'bxi_userDismissedPwaBanner';
  const runningInPwa = (window.matchMedia('(display-mode: standalone)').matches) || 
    (window.navigator.standalone) || 
    document.referrer.includes('android-app://');

  // Hide the vertical link and remix button in PWAs
  if (runningInPwa) {
    document.querySelector('.verticals-link').classList.add('d-none')
    
    const glitchButton = document.querySelector('.glitch-button');
    if (glitchButton) {
      glitchButton.classList.add('d-none');
    }
  }

  const bannerDismissed = localStorage.getItem(dismissedBannerKey) === 'true';
  if (!bannerDismissed && !runningInPwa && /iPhone/.test(navigator.userAgent)) {
    const tooltipEl = document.getElementById('pwa-tooltip');
    // Show banner
    tooltipEl.classList.remove('d-none');
    document.getElementById('pwa-tooltip-dismiss')?.addEventListener('click', () => {
      tooltipEl.classList.add('d-none');
      localStorage.setItem(dismissedBannerKey, true);
    });
  }
})();