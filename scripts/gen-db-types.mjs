#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Generates lib/supabase/database.types.ts by introspecting a PostgreSQL
// database over psql.
//
// `supabase gen types typescript` is the canonical generator and should be used
// whenever the CLI is available:
//
//     npx supabase gen types typescript --local > lib/supabase/database.types.ts
//
// This script exists because the CLI needs Docker, and a project that cannot
// type-check without Docker is a project that stops being type-checked. It
// emits the same shape for the parts this codebase uses — Tables, Views,
// Functions, Enums — so switching to the CLI later is a diff, not a rewrite.
//
//     node scripts/gen-db-types.mjs [database-name]
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const db = process.argv[2] ?? process.env.DB ?? 'samaj_setu_verify';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'lib/supabase/database.types.ts');

/** One psql round trip per question, each returning a single JSON document. */
function query(sql) {
  const raw = execFileSync('psql', ['-d', db, '-tAqc', sql], { encoding: 'utf8' });
  return JSON.parse(raw.trim() || '[]');
}

/* ----------------------------------------------------------- type mapping -- */

const SCALARS = new Map([
  ['uuid', 'string'], ['text', 'string'], ['varchar', 'string'], ['bpchar', 'string'],
  ['name', 'string'], ['citext', 'string'], ['date', 'string'], ['time', 'string'],
  ['timetz', 'string'], ['timestamp', 'string'], ['timestamptz', 'string'],
  ['interval', 'string'], ['bytea', 'string'],
  ['int2', 'number'], ['int4', 'number'], ['int8', 'number'],
  ['float4', 'number'], ['float8', 'number'], ['numeric', 'number'], ['oid', 'number'],
  ['bool', 'boolean'],
  ['json', 'Json'], ['jsonb', 'Json'],
  ['void', 'undefined'], ['record', 'Json'],
]);

const enums = new Set();

function tsType(pgType) {
  if (pgType.startsWith('_')) return `${tsType(pgType.slice(1))}[]`;
  if (enums.has(pgType)) return `Database["public"]["Enums"]["${pgType}"]`;
  return SCALARS.get(pgType) ?? 'unknown';
}

const quoteKey = (k) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k));

/* ------------------------------------------------------------ introspect -- */

const enumRows = query(`
  select coalesce(json_agg(json_build_object('name', t.typname, 'values', v.vals) order by t.typname), '[]')
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace and n.nspname = 'public'
  join lateral (
    select json_agg(e.enumlabel order by e.enumsortorder) as vals
    from pg_enum e where e.enumtypid = t.oid
  ) v on true
  where t.typtype = 'e'
`);
for (const e of enumRows) enums.add(e.name);

const relations = query(`
  select coalesce(json_agg(r order by r.name), '[]') from (
    select
      c.relname as name,
      c.relkind as kind,
      (
        select json_agg(json_build_object(
          'name', a.attname,
          'type', format_type(a.atttypid, null),
          'udt',  t.typname,
          'notnull', a.attnotnull,
          'hasdefault', a.atthasdef,
          'identity', a.attidentity <> '',
          'generated', a.attgenerated <> ''
        ) order by a.attnum)
        from pg_attribute a
        join pg_type t on t.oid = a.atttypid
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      ) as columns
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind in ('r', 'v', 'm')
  ) r
`);

// Real foreign keys, so that PostgREST embedding (`select('*, candidates(*)')`)
// type-checks. postgrest-js also requires the key to be present at all: without
// it the schema fails the GenericSchema constraint and every rpc() call
// silently degrades to `never` arguments.
const relationships = query(`
  select coalesce(json_agg(r order by r.table_name, r."foreignKeyName"), '[]') from (
    select
      src.relname as table_name,
      c.conname as "foreignKeyName",
      (select json_agg(a.attname order by k.ord)
       from unnest(c.conkey) with ordinality as k(attnum, ord)
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as columns,
      tgt.relname as "referencedRelation",
      (select json_agg(a.attname order by k.ord)
       from unnest(c.confkey) with ordinality as k(attnum, ord)
       join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as "referencedColumns",
      exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indisunique
          and i.indnatts = array_length(c.conkey, 1)
          and i.indkey::int2[] @> c.conkey and c.conkey @> i.indkey::int2[]
      ) as "isOneToOne"
    from pg_constraint c
    join pg_class src on src.oid = c.conrelid
    join pg_class tgt on tgt.oid = c.confrelid
    join pg_namespace n on n.oid = c.connamespace and n.nspname = 'public'
    where c.contype = 'f'
  ) r
`);

const routines = query(`
  select coalesce(json_agg(f order by f.name, f.args_sig), '[]') from (
    select
      p.proname as name,
      pg_get_function_identity_arguments(p.oid) as args_sig,
      t.typname as return_udt,
      p.proretset as returns_set,
      -- proargtypes holds the IN arguments only, and proargnames lists IN
      -- names first, so pairing them positionally is correct.
      (
        select json_agg(json_build_object('name', u.an, 'udt', pt.typname) order by u.ord)
        from unnest(
          coalesce(p.proargnames, array[]::text[]),
          coalesce(p.proargtypes::oid[], array[]::oid[])
        ) with ordinality as u(an, atoid, ord)
        join pg_type pt on pt.oid = u.atoid
      ) as args,
      -- "returns table(...)" columns are OUT arguments. Without these a
      -- set-returning function is typed as the useless "record".
      (
        select json_agg(json_build_object('name', u.an, 'udt', pt.typname) order by u.ord)
        from unnest(
          coalesce(p.proargnames, array[]::text[]),
          coalesce(p.proallargtypes, array[]::oid[]),
          coalesce(p.proargmodes, array[]::"char"[])
        ) with ordinality as u(an, atoid, amode, ord)
        join pg_type pt on pt.oid = u.atoid
        where u.amode in ('o', 't')
      ) as out_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    join pg_type t on t.oid = p.prorettype
    where p.prokind = 'f'
      -- The access-token hook is called by GoTrue, never by a client.
      and p.proname <> 'custom_access_token_hook'
  ) f
`);

/* --------------------------------------------------------------- emit ----- */

const L = [];
L.push('// Generated by scripts/gen-db-types.mjs — do not edit by hand.');
L.push('//');
L.push('// Regenerate after every migration:');
L.push('//   npm run db:verify && npm run db:types');
L.push('//');
L.push('// With the Supabase CLI available, prefer:');
L.push('//   npx supabase gen types typescript --local > lib/supabase/database.types.ts');
L.push('');
L.push('export type Json =');
L.push('  | string');
L.push('  | number');
L.push('  | boolean');
L.push('  | null');
L.push('  | { [key: string]: Json | undefined }');
L.push('  | Json[];');
L.push('');
L.push('export type Database = {');
L.push('  public: {');

const tables = relations.filter((r) => r.kind === 'r');
const views = relations.filter((r) => r.kind !== 'r');

function emitRelation(rel, isView) {
  const cols = rel.columns ?? [];
  L.push(`      ${quoteKey(rel.name)}: {`);

  L.push('        Row: {');
  for (const c of cols) {
    L.push(`          ${quoteKey(c.name)}: ${tsType(c.udt)}${c.notnull ? '' : ' | null'};`);
  }
  L.push('        };');

  if (isView) {
    // A non-updatable view in postgrest-js has Row and Relationships only.
  } else {
    L.push('        Insert: {');
    for (const c of cols) {
      // A generated column cannot be written at all; anything with a default,
      // an identity or a nullable type is optional.
      if (c.generated) continue;
      const optional = !c.notnull || c.hasdefault || c.identity;
      L.push(
        `          ${quoteKey(c.name)}${optional ? '?' : ''}: ${tsType(c.udt)}${c.notnull ? '' : ' | null'};`,
      );
    }
    L.push('        };');

    L.push('        Update: {');
    for (const c of cols) {
      if (c.generated) continue;
      L.push(`          ${quoteKey(c.name)}?: ${tsType(c.udt)}${c.notnull ? '' : ' | null'};`);
    }
    L.push('        };');
  }

  const links = relationships.filter((r) => r.table_name === rel.name);
  if (links.length === 0) {
    L.push('        Relationships: [];');
  } else {
    L.push('        Relationships: [');
    for (const link of links) {
      L.push(
        '          { foreignKeyName: ' + JSON.stringify(link.foreignKeyName) +
          '; columns: ' + JSON.stringify(link.columns).replace(/"/g, '"') +
          '; isOneToOne: ' + (link.isOneToOne ? 'true' : 'false') +
          '; referencedRelation: ' + JSON.stringify(link.referencedRelation) +
          '; referencedColumns: ' + JSON.stringify(link.referencedColumns) + ' },',
      );
    }
    L.push('        ];');
  }

  L.push('      };');
}

L.push('    Tables: {');
for (const t of tables) emitRelation(t, false);
L.push('    };');

L.push('    Views: {');
for (const v of views) emitRelation(v, true);
L.push('    };');

L.push('    Functions: {');
for (const f of routines) {
  const args = f.args ?? [];
  L.push(`      ${quoteKey(f.name)}: {`);
  if (args.length === 0) {
    L.push('        Args: Record<PropertyKey, never>;');
  } else {
    L.push('        Args: {');
    for (const a of args) L.push(`          ${quoteKey(a.name)}?: ${tsType(a.udt)};`);
    L.push('        };');
  }

  // A set-returning function whose row type is a table or composite is typed as
  // that row; anything else falls back to the scalar mapping.
  let ret = tsType(f.return_udt);
  const rel = relations.find((r) => r.name === f.return_udt);
  const outArgs = f.out_args ?? [];

  if (rel) {
    ret = `Database["public"]["${rel.kind === 'r' ? 'Tables' : 'Views'}"]["${rel.name}"]["Row"]`;
  } else if (outArgs.length > 0) {
    ret = `{ ${outArgs.map((a) => `${quoteKey(a.name)}: ${tsType(a.udt)} | null`).join('; ')} }`;
  } else if (ret === 'unknown' && f.returns_set) {
    ret = 'Record<string, unknown>';
  }
  L.push(`        Returns: ${ret}${f.returns_set ? '[]' : ''};`);
  L.push('      };');
}
L.push('    };');

L.push('    Enums: {');
for (const e of enumRows) {
  L.push(`      ${quoteKey(e.name)}: ${e.values.map((v) => JSON.stringify(v)).join(' | ')};`);
}
L.push('    };');

L.push('    CompositeTypes: Record<PropertyKey, never>;');
L.push('  };');
L.push('};');
L.push('');
L.push('export type Tables<T extends keyof Database["public"]["Tables"]> =');
L.push('  Database["public"]["Tables"][T]["Row"];');
L.push('export type Enums<T extends keyof Database["public"]["Enums"]> =');
L.push('  Database["public"]["Enums"][T];');
L.push('export type Fn<T extends keyof Database["public"]["Functions"]> =');
L.push('  Database["public"]["Functions"][T];');
L.push('');

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, L.join('\n'));
console.log(
  `wrote ${out}\n  ${tables.length} tables, ${views.length} views, ` +
    `${routines.length} functions, ${enumRows.length} enums`,
);
