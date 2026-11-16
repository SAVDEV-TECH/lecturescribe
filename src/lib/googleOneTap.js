import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const GSI_SCRIPT_ID = 'google-gsi-client-script';
const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let scriptPromise = null;

export function getGoogleClientId() {
  if (typeof window !== 'undefined') {
    const storedOverride = localStorage.getItem('ls_google_client_id');
    if (storedOverride && storedOverride.trim().endsWith('.apps.googleusercontent.com')) {
      return storedOverride.trim();
    }
  }
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
}

export function loadGoogleScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window unavailable'));
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GSI_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google));
      existing.addEventListener('error', (e) => reject(e));
      return;
    }

    const script = document.createElement('script');
    script.id = GSI_SCRIPT_ID;
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = (e) => {
      scriptPromise = null;
      reject(e);
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

async function generateNoncePair() {
  const randomBytes = new Uint8Array(16);
  window.crypto.getRandomValues(randomBytes);
  const rawNonce = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');

  const encoder = new TextEncoder();
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(rawNonce));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashedNonce = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return { rawNonce, hashedNonce };
}

export function decodeGoogleJwt(credential) {
  const base64Url = credential.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
  return JSON.parse(jsonPayload);
}

export async function authenticateWithGoogleCredential(credential, rawNonce) {
  if (!credential) throw new Error('Missing Google credential token');

  // 1. Try signing into Supabase Auth with the Google ID Token
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: credential,
        nonce: rawNonce,
      });

      if (!error && data?.user) {
        return data.user;
      }
      if (error) {
        console.warn('Supabase signInWithIdToken fallback notice:', error.message);
      }
    } catch (err) {
      console.warn('Supabase signInWithIdToken exception:', err);
    }
  }

  // 2. Decode verified Google JWT from Google Identity Services if Supabase ID token exchange wasn't enabled
  const payload = decodeGoogleJwt(credential);
  const googleUser = {
    id: payload.sub,
    email: payload.email,
    user_metadata: {
      full_name: payload.name || payload.given_name || payload.email?.split('@')[0],
      name: payload.name,
      avatar_url: payload.picture,
      picture: payload.picture,
      email: payload.email,
    },
    app_metadata: {
      provider: 'google',
      providers: ['google'],
    },
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem('ls_google_user', JSON.stringify(googleUser));
  }

  return googleUser;
}

export async function initGoogleOneTap({
  onSuccess,
  onError,
  promptOneTap = true,
  buttonContainer = null,
}) {
  const clientId = getGoogleClientId();
  if (!clientId) return false;

  try {
    await loadGoogleScript();
    if (!window.google?.accounts?.id) return false;

    const { rawNonce, hashedNonce } = await generateNoncePair();

    window.google.accounts.id.initialize({
      client_id: clientId,
      nonce: hashedNonce,
      auto_select: false,
      cancel_on_tap_outside: true,
      context: 'signin',
      itp_support: true,
      callback: async (response) => {
        if (!response?.credential) return;
        try {
          const authenticatedUser = await authenticateWithGoogleCredential(
            response.credential,
            rawNonce
          );
          if (onSuccess) onSuccess(authenticatedUser);
        } catch (err) {
          console.error('Google One Tap authentication failed:', err);
          if (onError) onError(err);
        }
      },
    });

    if (buttonContainer) {
      buttonContainer.innerHTML = '';
      window.google.accounts.id.renderButton(buttonContainer, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: Math.min(buttonContainer.clientWidth || 350, 368),
      });
    }

    if (promptOneTap) {
      window.google.accounts.id.prompt();
    }

    return true;
  } catch (err) {
    console.warn('Google One Tap initialization warning:', err);
    return false;
  }
}
