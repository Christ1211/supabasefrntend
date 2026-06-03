// Whitelist + classification of queryable sources, to keep the generic API safe.

export const TABLES = ['webinar_registrants', 'webinar_events'] as const;

const IDENT = /^[a-z_][a-z0-9_]*$/;

export function isValidIdent(name: string): boolean {
  return IDENT.test(name);
}

// Writable = real base tables only. Views (v_*) are read-only.
export function isWritable(name: string): boolean {
  return (TABLES as readonly string[]).includes(name);
}

// Readable = base tables or any view (name starts with v_). Blocks arbitrary
// access to other schemas / system tables.
export function isReadable(name: string): boolean {
  return isValidIdent(name) && (isWritable(name) || name.startsWith('v_'));
}
