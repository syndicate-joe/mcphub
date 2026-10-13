import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function validateCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    throw new Error('Catalog must be an object keyed by entry name');
  }
  for (const [name, entry] of Object.entries(catalog)) {
    if (['__proto__', 'constructor', 'prototype'].includes(name)) {
      throw new Error(`Invalid marketplace name: ${name}`);
    }
    if (
      !entry ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      typeof entry.description !== 'string' ||
      typeof entry.display_name !== 'string'
    ) {
      throw new Error(`Invalid marketplace entry: ${name}`);
    }
    if (entry.kind && !['mcp', 'skill'].includes(entry.kind)) {
      throw new Error(`Invalid marketplace kind: ${name}`);
    }
  }
  return catalog;
}

export function mergeCatalogs(base, overlay, skills = {}) {
  validateCatalog(base);
  validateCatalog(skills);
  if (
    overlay.schemaVersion !== 1 ||
    !Array.isArray(overlay.remove) ||
    !overlay.remove.every((name) => typeof name === 'string')
  ) {
    throw new Error('Invalid catalog overlay');
  }
  validateCatalog(overlay.entries);
  const result = { ...base };
  for (const [name, entry] of Object.entries(skills)) {
    result[name] = { ...entry, kind: 'skill' };
  }
  Object.assign(result, overlay.entries);
  for (const name of overlay.remove) delete result[name];
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

export async function fetchRegistry(fetcher = fetch) {
  const entries = {};
  const cursors = new Set();
  let cursor;
  do {
    const url = new URL('https://registry.modelcontextprotocol.io/v0.1/servers');
    url.searchParams.set('limit', '100');
    url.searchParams.set('version', 'latest');
    if (cursor) url.searchParams.set('cursor', cursor);
    const response = await fetcher(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Registry refresh failed: HTTP ${response.status}`);
    const page = await response.json();
    if (!Array.isArray(page.servers)) throw new Error('Invalid registry response');
    for (const { server, _meta } of page.servers) {
      if (!server || typeof server.name !== 'string' || typeof server.description !== 'string') {
        throw new Error('Invalid registry server');
      }
      const metadata = _meta?.['io.modelcontextprotocol.registry/official'];
      if (metadata?.status && metadata.status !== 'active') continue;
      if (metadata?.isLatest === false) continue;
      const key = `registry-${Buffer.from(server.name).toString('base64url')}`;
      if (entries[key] && entries[key].registry_name !== server.name) {
        throw new Error(`Registry name collision: ${key}`);
      }
      entries[key] = {
        name: key,
        registry_name: server.name,
        display_name: server.title || server.name,
        description: server.description,
        ...(server.repository?.url ? { repository: server.repository } : {}),
        homepage: server.websiteUrl || 'https://registry.modelcontextprotocol.io',
        author: { name: server.name.split('/')[0] },
        categories: ['Official Registry'],
        tags: ['MCP Registry'],
      };
    }
    cursor = page.metadata?.nextCursor;
    if (cursor && (typeof cursor !== 'string' || cursors.has(cursor) || cursors.size >= 1000)) {
      throw new Error('Invalid or repeated registry cursor');
    }
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return entries;
}

export async function syncCatalog(options) {
  const load = async (path) => JSON.parse(await readFile(path, 'utf8'));
  const overlay = await load(options.overlay);
  let base;
  if (options.mcpm) {
    const response = await fetch('https://mcpm.sh/api/servers.json', {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`MCPM refresh failed: HTTP ${response.status}`);
    base = await response.json();
    validateCatalog(base);
    if (Object.keys(base).length === 0) throw new Error('MCPM returned an empty catalog');
  } else {
    base = await load(options.base);
  }
  if (options.registry) base = { ...base, ...(await fetchRegistry()) };
  const skills = options.skills ? await load(options.skills) : {};
  const catalog = mergeCatalogs(base, overlay, skills);
  if (!options.check) {
    await mkdir(dirname(options.output), { recursive: true });
    const temporary = `${options.output}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(catalog, null, 2) + '\n', { flag: 'wx' });
      await rename(temporary, options.output);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return catalog;
}

async function main() {
  const { values } = parseArgs({
    options: {
      base: { type: 'string', default: resolve(root, 'servers.json') },
      overlay: { type: 'string', default: resolve(root, 'catalog/overrides.json') },
      output: { type: 'string', default: resolve(root, 'data/servers.json') },
      skills: { type: 'string' },
      mcpm: { type: 'boolean', default: false },
      registry: { type: 'boolean', default: false },
      check: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(
      'Usage: node scripts/sync-skills-and-registries.mjs [--mcpm] [--registry] [--base FILE] [--overlay FILE] [--skills FILE] [--output FILE] [--check]',
    );
    return;
  }
  const catalog = await syncCatalog(values);
  const skills = Object.values(catalog).filter((entry) => entry.kind === 'skill').length;
  console.log(
    `${values.check ? 'Validated' : 'Wrote'} ${Object.keys(catalog).length} entries (${skills} skills).`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
