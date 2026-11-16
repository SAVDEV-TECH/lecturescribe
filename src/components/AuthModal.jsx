'use client';

import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured, getUserDisplayInfo } from '@/lib/supabase';

export default function AuthModal({ isOpen, onClose, onAuthSuccess, onLogout, user }) {
  const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'register' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const supabaseReady = isSupabaseConfigured();
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const userInfo = getUserDisplayInfo(user);

  // Initialize Google One Tap script only when a real NEXT_PUBLIC_GOOGLE_CLIENT_ID is set and user is not logged in
  useEffect(() => {
    if (!isOpen || user || !supabaseReady || !googleClientId) return;

    const handleGoogleCredentialResponse = async (response) => {
      if (!response?.credential) return;
      setGoogleLoading(true);
      setMessage('');
      setIsError(false);

      try {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: response.credential,
        });

        if (error) throw error;
        if (data?.user) {
          onAuthSuccess(data.user);
          onClose();
        }
      } catch (err) {
        console.error('Google ID token sign-in error:', err);
        setIsError(true);
        setMessage(err.message || 'Google One Tap sign-in failed.');
      } finally {
        setGoogleLoading(false);
      }
    };

    const initializeGoogleOneTap = () => {
      if (typeof window !== 'undefined' && window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
          });
          window.google.accounts.id.prompt();
        } catch (err) {
          console.warn('Google One Tap init warning:', err);
        }
      }
    };

    if (!document.getElementById('google-client-script')) {
      const script = document.createElement('script');
      script.id = 'google-client-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initializeGoogleOneTap;
      document.body.appendChild(script);
    } else {
      initializeGoogleOneTap();
    }
  }, [isOpen, user, supabaseReady, googleClientId, onAuthSuccess, onClose]);

  if (!isOpen) return null;

  // Real Google OAuth Redirect via Supabase Auth
  const handleGoogleSignIn = async () => {
    setMessage('');
    setIsError(false);

    if (!supabaseReady) {
      setIsError(true);
      setMessage(
        'Supabase Auth is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment variables (and enable Google Provider in Supabase Dashboard) to sign in with Google.'
      );
      return;
    }

    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });
      if (error) throw error;
    } catch (err) {
      console.error('Google OAuth error:', err);
      setIsError(true);
      setMessage(err.message || 'Failed to launch Google Sign-In. Please check your Supabase Google OAuth provider settings.');
      setGoogleLoading(false);
    }
  };

  // Real Email / Password Sign-In, Registration, or Password Reset
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setIsError(false);

    if (!supabaseReady) {
      setIsError(true);
      setMessage(
        'Supabase Auth is not configured yet. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel to enable authentication.'
      );
      return;
    }

    setLoading(true);

    try {
      if (authMode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback`,
        });
        if (error) throw error;
        setIsError(false);
        setMessage('Password reset link sent to your email. Please check your inbox.');
      } else if (authMode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              full_name: fullName.trim() || email.trim().split('@')[0],
            },
          },
        });

        if (error) throw error;

        if (data?.user && !data?.session) {
          setIsError(false);
          setMessage('Account created! Please check your email inbox to confirm your address before signing in.');
          setAuthMode('signin');
        } else if (data?.user) {
          onAuthSuccess(data.user);
          onClose();
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

        if (error) throw error;

        if (data?.user) {
          onAuthSuccess(data.user);
          onClose();
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      setIsError(true);
      setMessage(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOutClick = async () => {
    setLoading(true);
    try {
      if (onLogout) {
        await onLogout();
      }
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '1rem',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          width: '100%',
          maxWidth: '420px',
          padding: '1.75rem',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        }}
      >
        {/* If User Is Logged In -> Show Authenticated Profile & Logout */}
        {userInfo ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Your Account</h2>
              <button onClick={onClose} aria-label="Close modal" style={{ color: 'var(--text-muted)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.9rem',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                marginBottom: '1.25rem',
              }}
            >
              {userInfo.avatar ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={userInfo.avatar}
                  alt={userInfo.name}
                  referrerPolicy="no-referrer"
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2px solid var(--primary)',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--primary)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {userInfo.initial}
                </div>
              )}

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {userInfo.name}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {userInfo.email}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      padding: '0.12rem 0.45rem',
                      borderRadius: '999px',
                      backgroundColor: 'rgba(16, 185, 129, 0.14)',
                      color: 'var(--success)',
                    }}
                  >
                    ● Cloud Sync Active
                  </span>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      padding: '0.12rem 0.45rem',
                      borderRadius: '999px',
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                      textTransform: 'capitalize',
                    }}
                  >
                    {userInfo.provider === 'google' ? 'Google Account' : 'Email Account'}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSignOutClick}
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.7rem 1rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid var(--danger)',
                color: 'var(--danger)',
                fontWeight: 600,
                fontSize: '0.86rem',
                cursor: 'pointer',
              }}
            >
              {loading ? 'Signing out...' : 'Sign Out'}
            </button>
          </div>
        ) : (
          /* Logged-out Sign In / Register / Reset View */
          <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                  {authMode === 'register'
                    ? 'Create an account'
                    : authMode === 'reset'
                    ? 'Reset password'
                    : 'Sign in to LectureScribe'}
                </h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  {authMode === 'reset'
                    ? 'Enter your email to receive a password reset link'
                    : 'Sync your lecture recordings, notes, and study decks across devices'}
                </p>
              </div>
              <button onClick={onClose} aria-label="Close modal" style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {!supabaseReady && (
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid var(--warning)',
                  color: 'var(--warning)',
                  fontSize: '0.76rem',
                  lineHeight: 1.45,
                  marginBottom: '1rem',
                }}
              >
                <strong>Setup Required:</strong> Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
                <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your Vercel Environment Variables and enable the Google provider in Supabase Auth.
              </div>
            )}

            {/* Google OAuth Button */}
            {authMode !== 'reset' && (
              <>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading || googleLoading}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    padding: '0.72rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: '#ffffff',
                    color: '#1f2937',
                    border: '1px solid #d1d5db',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    marginBottom: '1.25rem',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    cursor: loading || googleLoading ? 'wait' : 'pointer',
                    opacity: loading || googleLoading ? 0.75 : 1,
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
                  {googleLoading ? 'Redirecting to Google...' : 'Continue with Google'}
                </button>

                {/* Divider */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    marginBottom: '1.25rem',
                  }}
                >
                  <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }}></div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    or continue with email
                  </span>
                  <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }}></div>
                </div>
              </>
            )}

            {message && (
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: isError ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                  border: `1px solid ${isError ? 'var(--danger)' : 'var(--success)'}`,
                  color: isError ? 'var(--danger)' : 'var(--success)',
                  fontSize: '0.8rem',
                  lineHeight: 1.45,
                  marginBottom: '1rem',
                }}
              >
                {message}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {authMode === 'register' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.3rem', fontWeight: 600 }}>
                    FULL NAME
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.86rem',
                      color: 'var(--text-main)',
                      outline: 'none',
                    }}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.3rem', fontWeight: 600 }}>
                  EMAIL ADDRESS
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
                    color: 'var(--text-main)',
                    outline: 'none',
                  }}
                />
              </div>

              {authMode !== 'reset' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      PASSWORD
                    </label>
                    {authMode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('reset');
                          setMessage('');
                          setIsError(false);
                        }}
                        style={{ fontSize: '0.74rem', color: 'var(--primary)', fontWeight: 600 }}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    required
                    minLength={6}
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
                      color: 'var(--text-main)',
                      outline: 'none',
                    }}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading || googleLoading}
                style={{
                  padding: '0.7rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--primary)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  marginTop: '0.35rem',
                  opacity: loading ? 0.75 : 1,
                }}
              >
                {loading
                  ? 'Please wait...'
                  : authMode === 'register'
                  ? 'Create Account'
                  : authMode === 'reset'
                  ? 'Send Reset Link'
                  : 'Sign In'}
              </button>
            </form>

            <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {authMode === 'reset' ? (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setMessage('');
                    setIsError(false);
                  }}
                  style={{ color: 'var(--primary)', fontWeight: 600 }}
                >
                  ← Back to Sign In
                </button>
              ) : (
                <>
                  {authMode === 'register' ? 'Already have an account?' : "Don't have an account?"}{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode(authMode === 'register' ? 'signin' : 'register');
                      setMessage('');
                      setIsError(false);
                    }}
                    style={{ color: 'var(--primary)', fontWeight: 600 }}
                  >
                    {authMode === 'register' ? 'Sign in' : 'Create an account'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
