'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

export default function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  });
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Register Service Worker
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      const registerSw = () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('PWA ServiceWorker registered:', reg.scope);
          })
          .catch((err) => {
            console.warn('PWA ServiceWorker registration failed:', err);
          });
      };

      if (document.readyState === 'complete') {
        registerSw();
      } else {
        window.addEventListener('load', registerSw, { once: true });
      }
    }

    // Listen for install prompt
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      window.deferredInstallPrompt = e;
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowBanner(false);
      setInstallPrompt(null);
      window.deferredInstallPrompt = null;
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const triggerInstall = async () => {
    const promptEvent = installPrompt || window.deferredInstallPrompt;
    if (!promptEvent) {
      // iOS or browser without beforeinstallprompt
      alert('Install:\n• iPhone: Share > Add to Home Screen\n• Android: Menu > Install App');
      return;
    }

    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
    }
  };

  if (isInstalled || !showBanner) return null;

  return (
    <div className="no-print" style={{
      position: 'fixed',
      bottom: 'calc(4.75rem + env(safe-area-inset-bottom, 0px))',
      left: '1rem',
      right: '1rem',
      maxWidth: '460px',
      margin: '0 auto',
      zIndex: 100,
      backgroundColor: 'var(--bg-surface-elevated)',
      border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-md)',
      padding: '0.85rem 1.1rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.75rem',
      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.45)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Image src="/icon-192.png" alt="LectureScribe" width={38} height={38} style={{ borderRadius: '8px' }} />
        <div>
          <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-main)' }}>Install App</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Add to home screen</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        <button
          onClick={triggerInstall}
          style={{
            padding: '0.45rem 0.85rem',
            backgroundColor: 'var(--primary)',
            color: '#fff',
            fontSize: '0.78rem',
            fontWeight: 700,
            borderRadius: 'var(--radius-sm)'
          }}
        >
          Install
        </button>
        <button
          onClick={() => setShowBanner(false)}
          aria-label="Dismiss"
          style={{
            padding: '0.45rem 0.55rem',
            color: 'var(--text-muted)',
            fontSize: '0.8rem'
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
