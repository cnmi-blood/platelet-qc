(() => {
  'use strict';
  let deferredPrompt = null;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid || /Mobile/i.test(ua);
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  function setInstallButton() {
    const buttons = $$('.install-app-btn');
    if (!buttons.length) return;
    buttons.forEach(btn => {
      if (isStandalone()) { btn.classList.add('hidden'); return; }
      if (isMobile || deferredPrompt) btn.classList.remove('hidden'); else btn.classList.add('hidden');
    });
  }

  function showGuide(kind) {
    const d = $('#installDialog');
    if (!d) return;
    $('#iosInstallGuide')?.classList.toggle('hidden', kind !== 'ios');
    $('#androidInstallGuide')?.classList.toggle('hidden', kind !== 'android');
    $('#genericInstallGuide')?.classList.toggle('hidden', kind !== 'generic');
    const title = $('#installDialogTitle');
    const sub = $('#installDialogSubtitle');
    if (kind === 'ios') {
      title.textContent = 'เพิ่ม Blood QC บน iPhone / iPad';
      sub.textContent = 'iPhone ไม่เปิดหน้าติดตั้งอัตโนมัติ ระบบจะแสดงขั้นตอนเพิ่มไปยังหน้าจอโฮม';
    } else if (kind === 'android') {
      title.textContent = 'ติดตั้ง Blood QC บน Android';
      sub.textContent = 'ถ้าหน้าติดตั้งอัตโนมัติไม่ขึ้น ให้ทำตามขั้นตอนนี้ใน Chrome';
    } else {
      title.textContent = 'ติดตั้ง Blood QC';
      sub.textContent = 'ทำตามเมนูติดตั้งของ Browser ที่ใช้งาน';
    }
    if (typeof d.showModal === 'function') d.showModal();
  }

  async function installApp() {
    if (isStandalone()) return;
    if (isIOS) {
      showGuide('ios');
      return;
    }
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        const result = await deferredPrompt.userChoice;
        if (result?.outcome === 'accepted') {
          deferredPrompt = null;
          setInstallButton();
        }
      } catch (_) {}
      return;
    }
    showGuide(isAndroid ? 'android' : 'generic');
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    setInstallButton();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setInstallButton();
  });

  document.addEventListener('DOMContentLoaded', () => {
    setInstallButton();
    $$('.install-app-btn').forEach(btn => btn.addEventListener('click', installApp));
    $('#closeInstallDialogBtn')?.addEventListener('click', () => $('#installDialog')?.close());
    $('#installDialogOkBtn')?.addEventListener('click', () => $('#installDialog')?.close());
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(err => console.warn('Service worker registration failed', err));
    });
  }
})();
