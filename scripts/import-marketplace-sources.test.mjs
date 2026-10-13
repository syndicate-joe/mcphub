import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  classifySourcePath,
  sourceEntry,
  validateSources,
  fetchSource,
  importSources,
} from './import-marketplace-sources.mjs';

const source = {
  repo: 'github/awesome-copilot',
  format: 'copilot',
  label: 'Awesome Copilot',
  platform: 'GitHub Copilot',
  license: 'MIT',
};
const revision = 'a'.repeat(40);
const ok = (value) => ({ ok: true, json: async () => value, text: async () => value });

test('classifies real resource paths without treating executable support files as listings', () => {
  for (const [path, kind] of Object.entries({
    'skills/review/SKILL.md': 'skill',
    'agents/review.agent.md': 'agent',
    'workflows/report.md': 'workflow',
    'prompts/test.prompt.md': 'prompt',
    'instructions/code.instructions.md': 'instruction',
    'hooks/check/README.md': 'hook',
    'plugins/test/plugin.json': 'plugin',
  }))
    assert.equal(classifySourcePath(source, path), kind);
  assert.equal(classifySourcePath(source, 'hooks/check/run.sh'), null);
  assert.equal(classifySourcePath(source, 'README.md'), null);
  const claude = { ...source, format: 'claude-plugins' };
  assert.equal(
    classifySourcePath(claude, 'external_plugins/asana/.claude-plugin/plugin.json'),
    'plugin',
  );
  assert.equal(classifySourcePath(claude, 'plugins/review/commands/review.md'), 'prompt');
});

test('imports listing metadata with immutable provenance and no launch commands', () => {
  const text =
    '---\nname: Review\ndescription: >\n  Review code\n  for errors.\nlicense: Apache-2.0\ncompatibility: Claude Code\n---\n# Body';
  const [key, entry] = sourceEntry(
    source,
    'skills/review/SKILL.md',
    text,
    revision,
    '2026-10-13T00:00:00Z',
  );
  assert.match(key, /^github-/);
  assert.equal(entry.description, 'Review code for errors.');
  assert.equal(entry.compatibility, 'Claude Code');
  assert.equal(entry.license, 'Apache-2.0');
  assert.equal(entry.provenance.revision, revision);
  assert.ok(entry.homepage.includes(revision));
  assert.deepEqual(entry.installations, {});
});

test('handles command argument syntax without interpreting it as listing metadata', () => {
  const [, entry] = sourceEntry(
    { ...source, format: 'claude-plugins' },
    'plugins/test/commands/check.md',
    '---\ndescription: Check project\nargument-hint: [system] [--source <path>]\n---',
    revision,
    'today',
  );
  assert.equal(entry.kind, 'prompt');
  assert.equal(entry.description, 'Check project');
});

test('flags nonstandard descriptions instead of silently claiming validated YAML', () => {
  const [, entry] = sourceEntry(
    source,
    'agents/test.agent.md',
    '---\nname: Example\ndescription: Use this: when reviewing\n---',
    revision,
    'today',
  );
  assert.equal(entry.description, 'Use this: when reviewing');
  assert.deepEqual(entry.provenance.metadataWarnings, ['description']);
});

test('keeps same-named resources separate by canonical repository and path', () => {
  const first = sourceEntry(
    source,
    'skills/review/SKILL.md',
    '---\nname: Review\n---',
    revision,
    'today',
  )[0];
  const second = sourceEntry(
    source,
    'agents/review.agent.md',
    '---\nname: Review\n---',
    revision,
    'today',
  )[0];
  assert.notEqual(first, second);
});

test('validates allowlisted source formats and rejects duplicates and arbitrary URLs', () => {
  assert.deepEqual(validateSources({ schemaVersion: 1, sources: [source] }), [source]);
  assert.throws(() => validateSources({ schemaVersion: 1, sources: [source, source] }));
  assert.throws(() =>
    validateSources({ schemaVersion: 1, sources: [{ ...source, repo: 'https://example.com' }] }),
  );
  assert.throws(() =>
    validateSources({ schemaVersion: 1, sources: [{ ...source, format: 'shell' }] }),
  );
});

test('fetches only matching files at one pinned commit and rejects incomplete trees', async () => {
  const urls = [];
  const fetcher = async (url) => {
    urls.push(url);
    if (url.includes('/commits/')) return ok({ sha: revision });
    if (url.includes('/git/trees/'))
      return ok({
        tree: [
          { type: 'blob', path: 'agents/review.agent.md', size: 40 },
          { type: 'blob', path: 'run.sh', size: 10 },
        ],
      });
    return ok('---\nname: Review\ndescription: Review code\n---');
  };
  const result = await fetchSource(source, fetcher);
  assert.equal(result.count, 1);
  assert.equal(urls.length, 3);
  assert.ok(urls.at(-1).includes(`/${revision}/agents/`));
  await assert.rejects(
    fetchSource(source, async (url) =>
      url.includes('/commits/') ? ok({ sha: revision }) : ok({ truncated: true, tree: [] }),
    ),
    /Incomplete/,
  );
  await assert.rejects(
    fetchSource(source, async () => ({ ok: false, status: 429 })),
    /429/,
  );
});

test('failed imports preserve the previous snapshot and successful check mode is read-only', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcphub-sources-'));
  const options = { manifest: join(dir, 'sources.json'), output: join(dir, 'imported.json') };
  try {
    await writeFile(options.manifest, JSON.stringify({ schemaVersion: 1, sources: [source] }));
    await writeFile(options.output, 'previous snapshot');
    await assert.rejects(importSources(options, async () => ({ ok: false, status: 503 })));
    assert.equal(await readFile(options.output, 'utf8'), 'previous snapshot');
    const fetcher = async (url) =>
      url.includes('/commits/')
        ? ok({ sha: revision })
        : url.includes('/git/trees/')
          ? ok({ tree: [{ type: 'blob', path: 'workflows/report.md', size: 10 }] })
          : ok('# Report');
    const checked = await importSources({ ...options, check: true }, fetcher);
    assert.equal(Object.values(checked.entries)[0].compatibility, 'GitHub Agentic Workflows');
    assert.equal(await readFile(options.output, 'utf8'), 'previous snapshot');
    await importSources(options, fetcher);
    assert.equal(JSON.parse(await readFile(options.output, 'utf8')).schemaVersion, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
