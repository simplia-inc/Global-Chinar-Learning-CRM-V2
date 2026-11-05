import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variable names
const ENV_URL_KEY = 'VITE_SUPABASE_URL';
const ENV_ANON_KEY = 'VITE_SUPABASE_ANON_KEY';

// Local storage keys for manual override fallback if env vars are unset or pointing to wrong project
const STORAGE_URL_KEY = 'global_chinar_supabase_url';
const STORAGE_ANON_KEY = 'global_chinar_supabase_anon';

export interface SupabaseConfigInfo {
  url: string;
  anonKey: string;
  isConfigured: boolean;
  projectHost: string;
  projectRef: string;
  source: 'environment' | 'storage' | 'none';
  envHost?: string;
}

/**
 * Clean and sanitize string by trimming whitespace and stripping enclosing quotes
 */
function sanitizeEnvValue(val?: string | null): string {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '').trim();
}

/**
 * Reads credentials:
 * 1. User manual override in localStorage (if set by user to point to their real global-chinar-crm project)
 * 2. System environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY)
 */
export function getSupabaseCredentials(): SupabaseConfigInfo {
  const envUrl = sanitizeEnvValue(import.meta.env[ENV_URL_KEY]);
  const envKey = sanitizeEnvValue(import.meta.env[ENV_ANON_KEY]);

  let storedUrl = '';
  let storedKey = '';
  if (typeof window !== 'undefined') {
    storedUrl = sanitizeEnvValue(localStorage.getItem(STORAGE_URL_KEY));
    storedKey = sanitizeEnvValue(localStorage.getItem(STORAGE_ANON_KEY));
  }

  let url = '';
  let anonKey = '';
  let source: 'environment' | 'storage' | 'none' = 'none';

  // Check if user explicitly configured an override in localStorage
  if (storedUrl && storedKey) {
    url = storedUrl;
    anonKey = storedKey;
    source = 'storage';
  } else if (envUrl && envKey) {
    url = envUrl;
    anonKey = envKey;
    source = 'environment';
  }

  const isPlaceholder =
    !url ||
    !anonKey ||
    url.includes('your-project-id') ||
    anonKey.includes('your-anon-key');

  const isConfigured = Boolean(!isPlaceholder && url.startsWith('http'));

  let projectHost = '';
  let projectRef = '';
  if (isConfigured) {
    try {
      const parsed = new URL(url);
      projectHost = parsed.host;
      projectRef = parsed.host.split('.')[0] || '';
    } catch {
      projectHost = url;
    }
  }

  let envHost = '';
  if (envUrl) {
    try {
      envHost = new URL(envUrl).host;
    } catch {
      envHost = envUrl;
    }
  }

  return {
    url,
    anonKey,
    isConfigured,
    projectHost,
    projectRef,
    source: isConfigured ? source : 'none',
    envHost,
  };
}

export function saveLocalSupabaseCredentials(url: string, anonKey: string): void {
  const cleanUrl = sanitizeEnvValue(url);
  const cleanKey = sanitizeEnvValue(anonKey);
  localStorage.setItem(STORAGE_URL_KEY, cleanUrl);
  localStorage.setItem(STORAGE_ANON_KEY, cleanKey);
  cachedClient = null;
}

export function clearLocalSupabaseCredentials(): void {
  localStorage.removeItem(STORAGE_URL_KEY);
  localStorage.removeItem(STORAGE_ANON_KEY);
  cachedClient = null;
}

let cachedClient: SupabaseClient | null = null;
let currentClientKey = '';

export function getSupabaseClient(): SupabaseClient | null {
  const creds = getSupabaseCredentials();

  if (!creds.isConfigured) {
    return null;
  }

  const keyFingerprint = `${creds.url}:${creds.anonKey}`;

  if (!cachedClient || currentClientKey !== keyFingerprint) {
    try {
      cachedClient = createClient(creds.url, creds.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
      currentClientKey = keyFingerprint;
    } catch (err) {
      console.error('Failed to initialize Supabase client:', err);
      return null;
    }
  }

  return cachedClient;
}

// Initialized client export
export const supabase = getSupabaseClient();

export interface SupabaseAuditResult {
  isConfigured: boolean;
  projectHost: string;
  source: 'environment' | 'storage' | 'none';
  authReachable: boolean;
  databaseReachable: boolean;
  profilesTableExists: boolean;
  error?: string;
  tablesStatus?: {
    profiles: boolean;
    leads: boolean;
    lead_assignments: boolean;
    follow_ups: boolean;
  };
}

/**
 * Performs a live audit of the Supabase connection and checks existence of required CRM tables
 */
export async function auditSupabaseConnection(): Promise<SupabaseAuditResult> {
  const creds = getSupabaseCredentials();
  if (!creds.isConfigured) {
    return {
      isConfigured: false,
      projectHost: '',
      source: 'none',
      authReachable: false,
      databaseReachable: false,
      profilesTableExists: false,
      error: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY',
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      isConfigured: true,
      projectHost: creds.projectHost,
      source: creds.source,
      authReachable: false,
      databaseReachable: false,
      profilesTableExists: false,
      error: 'Client failed to initialize',
    };
  }

  try {
    const { error: sessionErr } = await client.auth.getSession();
    const authReachable = !sessionErr;

    const [profRes, leadsRes, assignRes, followRes] = await Promise.all([
      client.from('profiles').select('id', { count: 'exact', head: true }),
      client.from('leads').select('id', { count: 'exact', head: true }),
      client.from('lead_assignments').select('id', { count: 'exact', head: true }),
      client.from('follow_ups').select('id', { count: 'exact', head: true }),
    ]);

    const isSchemaError = (err: any) =>
      Boolean(err && (err.code === 'PGRST205' || err.message?.includes('schema cache') || err.message?.includes('does not exist')));

    const tablesStatus = {
      profiles: !isSchemaError(profRes.error),
      leads: !isSchemaError(leadsRes.error),
      lead_assignments: !isSchemaError(assignRes.error),
      follow_ups: !isSchemaError(followRes.error),
    };

    const databaseReachable = !profRes.error || profRes.error.code !== 'ECONNREFUSED';

    return {
      isConfigured: true,
      projectHost: creds.projectHost,
      source: creds.source,
      authReachable,
      databaseReachable,
      profilesTableExists: tablesStatus.profiles,
      tablesStatus,
      error: profRes.error && isSchemaError(profRes.error) ? profRes.error.message : undefined,
    };
  } catch (err: any) {
    return {
      isConfigured: true,
      projectHost: creds.projectHost,
      source: creds.source,
      authReachable: false,
      databaseReachable: false,
      profilesTableExists: false,
      error: err.message || 'Network error connecting to Supabase',
    };
  }
}
