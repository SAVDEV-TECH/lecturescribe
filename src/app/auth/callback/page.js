'use client';

import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    const completeAuthRedirect = async () => {
      if (typeof window === 'undefined') return;

      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

      const errorDesc =
        searchParams.get('error_description') ||
        hashParams.get('error_description') ||
        searchParams.get('error') ||
        hashParams.get('error');

      if (errorDesc) {
        if (isMounted) setErrorMessage(errorDesc);
        return;
      }

      if (!isSupabaseConfigured() || !supabase) {
        window.location.replace('/');
        return;
      }

      const code = searchParams.get('code');
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            // Check if detectSessionInUrl already exchanged the code
            const { data: existing } = await supabase.auth.getSession();
            if (!existing?.session) {
              throw error;
            }
          }
        } else {
          await supabase.auth.getSession();
        }
        window.location.replace('/?auth=success');
      } catch (err) {
        console.error('OAuth callback error:', err);
        if (isMounted) {
          setErrorMessage(err.message || 'Google sign-in failed.');
        }
      }
    };

    completeAuthRedirect();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg-app)',
      color: 'var(--text-main)',
      padding: '1.5rem'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '2rem',
        maxWidth: '420px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 20px 40px rgba(0,0,0,0.35)'
      }}>
        {errorMessage ? (
          <>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: 'var(--danger)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              fontWeight: 700,
              marginBottom: '1rem'
            }}>
              !
            </div>
            <h1 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Sign-In Error
            </h1>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.replace('/')}
              style={{
                padding: '0.65rem 1.25rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--primary)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.86rem'
              }}
            >
              Back
            </button>
          </>
        ) : (
          <>
            <div style={{
              width: '36px',
              height: '36px',
              border: '3px solid var(--border-subtle)',
              borderTopColor: 'var(--primary)',
              borderRadius: '50%',
              margin: '0 auto 1rem auto',
              animation: 'spin 0.8s linear infinite'
            }} />
            <h1 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.35rem' }}>
              Signing in...
            </h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Syncing workspace.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
