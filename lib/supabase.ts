import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser / RSC-safe client — anon key, read-only under RLS.
 * Safe to import from any Server or Client Component.
 */
export function getPublicClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.'
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Server-only client — service role key, bypasses RLS.
 * Used exclusively by scripts/ and the cron API route. NEVER import this from
 * a file that ships to the client.
 */
export function getServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for a server-only operation.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 96);
}
