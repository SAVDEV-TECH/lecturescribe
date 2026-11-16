import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

export const isSupabaseConfigured = () => Boolean(supabaseUrl && supabaseAnonKey);

export function getUserDisplayInfo(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  const appMeta = user.app_metadata || {};
  const email = user.email || meta.email || '';
  const name =
    meta.full_name ||
    meta.name ||
    user.name ||
    (email ? email.split('@')[0] : 'Student');
  const avatar = meta.avatar_url || meta.picture || user.avatar || null;
  const provider =
    appMeta.provider ||
    (Array.isArray(appMeta.providers) && appMeta.providers.includes('google') ? 'google' : 'email');

  return {
    id: user.id,
    email,
    name,
    avatar,
    provider,
    initial: (name || email || 'U').charAt(0).toUpperCase()
  };
}
