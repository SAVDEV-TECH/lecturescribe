'use client';

import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  // Initialize Google One Tap script when modal is opened
  useEffect(() => {
    if (!isOpen) return;

    const handleGoogleCredentialResponse = async (response) => {
      if (!response.credential) return;

      if (isSupabaseConfigured()) {
        try {
          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: response.credential,
          });

          if (error) throw error;
          if (data.user) {
            onAuthSuccess(data.user);
            onClose();
          }
        } catch (err) {
          console.error('Google token sign-in error:', err);
        }
      } else {
        // Decode JWT payload for local session
        try {
          const base64Url = response.credential.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(
            atob(base64)
              .split('')
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          );
          const payload = JSON.parse(jsonPayload);
          const googleUser = {
            id: payload.sub,
            email: payload.email,
            name: payload.name || payload.email.split('@')[0],
            avatar: payload.picture
          };
          localStorage.setItem('local_student_user', JSON.stringify(googleUser));
          onAuthSuccess(googleUser);
          onClose();
        } catch (e) {
          console.warn('Error parsing Google payload:', e);
        }
      }
    };

    const initializeGoogleOneTap = () => {
      if (typeof window !== 'undefined' && window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || 'dummy-google-client-id',
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
          });

          // Prompt Google One Tap popup
          window.google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
              console.log('Google One Tap prompt skipped or not displayed in this environment.');
            }
          });
        } catch (err) {
          console.warn('Google One Tap note:', err);
        }
      }
    };

    // Check if Google GIS script is already loaded
    if (!document.getElementById('google-client-script')) {
      const script = document.createElement('script');
      script.id = 'google-client-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        initializeGoogleOneTap();
      };
      document.body.appendChild(script);
    } else {
      initializeGoogleOneTap();
    }
  }, [isOpen, onAuthSuccess, onClose]);

  if (!isOpen) return null;

  // Google OAuth button click
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setMessage('');
    setIsError(false);

    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin
          }
        });
        if (error) throw error;
      } catch (err) {
        console.error('Google OAuth error:', err);
        setIsError(true);
        setMessage(err.message || 'Google sign-in error. Verify Supabase Google provider settings.');
        setLoading(false);
      }
    } else {
      // Local fallback simulation for Google Sign In
      const mockGoogleUser = {
        id: 'google_user_' + Date.now(),
        email: 'user@gmail.com',
        name: 'Google User',
        avatar: null
      };
      localStorage.setItem('local_student_user', JSON.stringify(mockGoogleUser));
      onAuthSuccess(mockGoogleUser);
      setLoading(false);
      onClose();
    }
  };

  // Standard Email / Password Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setIsError(false);

    if (!isSupabaseConfigured()) {
      const mockUser = {
        id: 'local_user_' + Date.now(),
        email: email || 'student@university.edu',
        name: fullName || email.split('@')[0] || 'Student User'
      };
      localStorage.setItem('local_student_user', JSON.stringify(mockUser));
      onAuthSuccess(mockUser);
      onClose();
      return;
    }

    setLoading(true);

    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            data: { full_name: fullName.trim() || email.split('@')[0] }
          }
        });

        if (error) throw error;

        if (data.user && !data.session) {
          setMessage('Confirmation email dispatched. Verify account then sign in.');
          setIsRegister(false);
        } else if (data.user) {
          onAuthSuccess(data.user);
          onClose();
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password
        });

        if (error) throw error;

        if (data.user) {
          onAuthSuccess(data.user);
          onClose();
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      setIsError(true);
      setMessage(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '1rem',
      backdropFilter: 'blur(3px)'
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        width: '100%',
        maxWidth: '400px',
        padding: '2rem',
        boxShadow: '0 20px 40px rgba(0,0,0,0.35)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
              {isRegister ? 'Create an account' : 'Sign in'}
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Access synced lecture notes and review decks
            </p>
          </div>
          <button onClick={onClose} style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Google One-Click Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            padding: '0.7rem 1rem',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: '#ffffff',
            color: '#1f2937',
            border: '1px solid #d1d5db',
            fontSize: '0.86rem',
            fontWeight: 600,
            marginBottom: '1.25rem',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            cursor: 'pointer'
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.87c2.27-2.09 3.67-5.17 3.67-9.15z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3.05c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.26v3.15C3.25 21.36 7.35 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.61H1.26C.46 8.23 0 10.06 0 12s.46 3.77 1.26 5.39l4.01-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.25 2.64 1.26 6.61l4.01 3.15c.95-2.85 3.6-4.96 6.73-4.96z"
            />
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '1.25rem'
        }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }}></div>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            or continue with email
          </span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }}></div>
        </div>

        {message && (
          <div style={{
            padding: '0.65rem 0.85rem',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: isError ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
            border: `1px solid ${isError ? 'var(--danger)' : 'var(--success)'}`,
            color: isError ? 'var(--danger)' : 'var(--success)',
            fontSize: '0.8rem',
            marginBottom: '1rem'
          }}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {isRegister && (
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.3rem', fontWeight: 600 }}>
                FULL NAME
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.86rem',
                  outline: 'none'
                }}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.3rem', fontWeight: 600 }}>
              EMAIL
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@university.edu"
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.86rem',
                outline: 'none'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.3rem', fontWeight: 600 }}>
              PASSWORD
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.86rem',
                outline: 'none'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.7rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--primary)',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.88rem',
              marginTop: '0.35rem',
            }}
          >
            {loading ? 'Authenticating...' : (isRegister ? 'Register' : 'Sign In')}
          </button>
        </form>

        <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setMessage('');
            }}
            style={{ color: 'var(--primary)', fontWeight: 600 }}
          >
            {isRegister ? 'Sign in' : 'Create an account'}
          </button>
        </div>
      </div>
    </div>
  );
}
