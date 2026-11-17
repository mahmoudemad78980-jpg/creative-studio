/* =====================================================
   pwa.js — Service Worker registration + install prompt
   ===================================================== */
(function (global) {
  'use strict';

  const SW_URL = 'sw.js';
  const SW_VERSION_KEY = 'cs_sw_version';
  let _deferredInstallPrompt = null;

  function register() {
    if (!('serviceWorker' in navigator)) {
      console.info('[PWA] Service workers not supported in this browser');
      return Promise.resolve(null);
    }
    return navigator.serviceWorker.register(SW_URL, { scope: './' })
      .then((reg) => {
        console.info('[PWA] Service worker registered with scope:', reg.scope);
        // Check for updates
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              global.dispatchEvent(new CustomEvent('pwa:updated'));
            }
          });
        });
        return reg;
      })
      .catch((err) => {
        console.error('[PWA] Service worker registration failed:', err);
        return null;
      });
  }

  function listenForUpdates(callback) {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (callback) callback();
    });
  }

  function setupInstallPrompt(installBtn) {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      _deferredInstallPrompt = e;
      if (installBtn) installBtn.hidden = false;
    });

    window.addEventListener('appinstalled', () => {
      _deferredInstallPrompt = null;
      if (installBtn) installBtn.hidden = true;
      if (global.App && global.App.toast) {
        global.App.toast('تم تثبيت التطبيق بنجاح!', 'success');
      }
    });

    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!_deferredInstallPrompt) return;
        installBtn.disabled = true;
        try {
          _deferredInstallPrompt.prompt();
          const { outcome } = await _deferredInstallPrompt.userChoice;
          if (outcome === 'accepted') {
            installBtn.hidden = true;
          }
        } catch (err) {
          console.error(err);
        } finally {
          _deferredInstallPrompt = null;
          installBtn.disabled = false;
        }
      });
    }
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function isOnline() {
    return navigator.onLine;
  }

  function watchNetwork(callback) {
    const update = () => callback(isOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }

  global.PWA = {
    register,
    listenForUpdates,
    setupInstallPrompt,
    isStandalone,
    isOnline,
    watchNetwork,
    SW_VERSION_KEY,
  };
})(window);
