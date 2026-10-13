import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeCatalogs, syncCatalog, fetchRegistry } from './sync-skills-and-registries.mjs';

const entry = (description) => ({ display_name: 'Example', description });
const overlay = { schemaVersion: 1, remove: ['removed'], entries: { custom: entry('preserved') } };

test('refresh retains custom entries and removals while adding new upstream entries', () => {
  const merged = mergeCatalogs(
    { removed: entry('old'), fresh: entry('new'), custom: entry('upstream') },
    overlay,
  );
  assert.deepEqual(Object.keys(merged), ['custom', 'fresh']);
  assert.equal(merged.custom.description, 'preserved');
});

test('skill imports are typed as skills and malformed catalogs are rejected', () => {
  const merged = mergeCatalogs({}, overlay, { skill: entry('assistant skill') });
  assert.equal(merged.skill.kind, 'skill');
  assert.throws(() => mergeCatalogs([], overlay));
  assert.throws(() => mergeCatalogs({}, { ...overlay, schemaVersion: 2 }));
  assert.throws(() => mergeCatalogs(JSON.parse('{"__proto__":{}}'), overlay));
});

test('curated entries and removals also take priority over skill exports', () => {
  const merged = mergeCatalogs({}, overlay, {
    custom: entry('external version'),
    removed: entry('external removed listing'),
  });
  assert.equal(merged.custom.description, 'preserved');
  assert.equal(merged.removed, undefined);
});

test('registry follows pagination, excludes inactive entries, and never invents launch commands', async () => {
  let calls = 0;
  const entries = await fetchRegistry(async (url) => {
    calls++;
    assert.equal(url.searchParams.get('version'), 'latest');
    assert.equal(url.searchParams.get('cursor'), calls === 1 ? null : 'next');
    return {
      ok: true,
      json: async () =>
        calls === 1
          ? {
              servers: [{ server: { name: 'io.example/server', description: 'Example' } }],
              metadata: { nextCursor: 'next' },
            }
          : {
              servers: [
                {
                  server: { name: 'io.example/old', description: 'Old' },
                  _meta: { 'io.modelcontextprotocol.registry/official': { status: 'deleted' } },
                },
              ],
            },
    };
  });
  assert.equal(calls, 2);
  assert.deepEqual(Object.keys(entries), [
    'registry-' + Buffer.from('io.example/server').toString('base64url'),
  ]);
  assert.equal(
    entries['registry-' + Buffer.from('io.example/server').toString('base64url')].installations,
    undefined,
  );
});

test('registry aborts repeated pagination and transport errors', async () => {
  await assert.rejects(
    fetchRegistry(async () => ({
      ok: true,
      json: async () => ({ servers: [], metadata: { nextCursor: 'same' } }),
    })),
    /cursor/,
  );
  await assert.rejects(
    fetchRegistry(async () => ({ ok: false, status: 503 })),
    /503/,
  );
});

test('registry preserves distinct names that would collide as slugs', async () => {
  const entries = await fetchRegistry(async () => ({
    ok: true,
    json: async () => ({
      servers: [
        { server: { name: 'io.example/a.b', description: 'First' } },
        { server: { name: 'io.example/a-b', description: 'Second' } },
      ],
    }),
  }));
  assert.equal(Object.keys(entries).length, 2);
});

test('invalid input leaves an existing output intact; check is read-only; valid sync writes a complete catalog', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcphub-catalog-'));
  const options = {
    base: join(dir, 'base.json'),
    overlay: join(dir, 'overlay.json'),
    output: join(dir, 'out.json'),
  };
  try {
    await writeFile(options.output, 'original');
    await writeFile(options.overlay, JSON.stringify(overlay));
    await writeFile(options.base, '[]');
    await assert.rejects(syncCatalog(options));
    assert.equal(await readFile(options.output, 'utf8'), 'original');
    await writeFile(options.base, JSON.stringify({ fresh: entry('new') }));
    await syncCatalog({ ...options, check: true });
    assert.equal(await readFile(options.output, 'utf8'), 'original');
    await syncCatalog(options);
    assert.deepEqual(Object.keys(JSON.parse(await readFile(options.output, 'utf8'))), [
      'custom',
      'fresh',
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
