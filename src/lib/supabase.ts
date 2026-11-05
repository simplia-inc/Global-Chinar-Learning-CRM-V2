import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase credentials are injected by the deployment environment at build time.
const ENV_URL_KEY = 'VITE_SUPABASE_URL';
const ENV_ANON_KEY = 'VITE_SUPABASE_ANON_KEY';

// Legacy browser override keys retained only as a local-development fallback.
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

function sanitizeEnvValue(val?: string | null): string {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '').trim();
}

/**
 * Prefer deployment environment variables over browser storage.
 * This prevents stale localStorage credentials from silently redirecting
 * the production CRM to a different Supabase project.
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

  // Production/deployment configuration always wins when both values exist.
  if (envUrl && envKey) {
    url = envUrl;
    anonKey = envKey;
    source = 'environment';

    // Remove legacy overrides so they cannot unexpectedly affect a later build.
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_URL_KEY);
      localStorage.removeItem(STORAGE_ANON_KEY);
    }
  } else if (storedUrl && storedKey) {
    // Keep local override support only when environment variables are absent.
    url = storedUrl;
    anonKey = storedKey;
    source = 'storage';
  }

  const isPlaceholder =
    !url ||
    !anonKey ||
    url.includes('your-project-id') ||
    anonKey.includes('your-anon-key');

  const isConfigured = Boolean(!isPlaceholder && url.startsWith('https://'));

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
 * Performs a live audit of the Supabase connection and checks existence of required CRM tables.
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
