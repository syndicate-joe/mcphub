import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { load, JSON_SCHEMA } from 'js-yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kinds = ['skill', 'agent', 'workflow', 'prompt', 'instruction', 'hook', 'plugin'];

export function classifySourcePath(source, path) {
  if (source.format === 'copilot') {
    if (/^agents\/[^/]+\.agent\.md$/.test(path)) return 'agent';
    if (/^instructions\/[^/]+\.instructions\.md$/.test(path)) return 'instruction';
    if (/^workflows\/[^/]+\.md$/.test(path)) return 'workflow';
    if (/^prompts\/[^/]+\.prompt\.md$/.test(path)) return 'prompt';
    if (/^hooks\/[^/]+\/README\.md$/.test(path)) return 'hook';
    if (/^plugins\/[^/]+\/plugin\.json$/.test(path)) return 'plugin';
  }
  if (source.format === 'claude-plugins') {
    if (/^(plugins|external_plugins)\/[^/]+\/\.claude-plugin\/plugin\.json$/.test(path))
      return 'plugin';
    if (/^plugins\/[^/]+\/commands\/[^/]+\.md$/.test(path)) return 'prompt';
    if (/^plugins\/[^/]+\/agents\/[^/]+\.md$/.test(path)) return 'agent';
  }
  if (
    /^skills\/[^/]+\/SKILL\.md$/.test(path) ||
    (source.format === 'claude-plugins' && /^plugins\/[^/]+\/skills\/[^/]+\/SKILL\.md$/.test(path))
  )
    return 'skill';
  return null;
}

const plain = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
export function sourceEntry(source, path, text, revision, fetchedAt) {
  const kind = classifySourcePath(source, path);
  if (!kind || !/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid source entry');
  let metadata = {};
  const metadataWarnings = [];
  if (path.endsWith('.json')) metadata = JSON.parse(text);
  else {
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (frontmatter) {
      // Command arguments may use platform syntax that is not YAML. Read only listing fields.
      const fields =
        frontmatter[1].match(
          /^(?:name|description|license|compatibility):[^\n]*(?:\n[ \t]+[^\n]*)*/gm,
        ) || [];
      for (const field of fields) {
        const key = field.slice(0, field.indexOf(':'));
        try {
          metadata[key] = load(field, { schema: JSON_SCHEMA })?.[key];
        } catch {
          metadata[key] = field
            .slice(field.indexOf(':') + 1)
            .trim()
            .replace(/^(["'])([\s\S]*)\1$/, '$2');
          metadataWarnings.push(key);
        }
      }
    }
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    throw new Error(`Invalid metadata: ${path}`);
  const fallback = path
    .split('/')
    .at(-1)
    .replace(/\.(agent|instructions|prompt)\.md$|\.md$/, '');
  const folder = path.split('/').at(-2);
  const title = text.match(/^#\s+(.+)$/m)?.[1];
  const name =
    plain(metadata.name) ||
    (['skill', 'plugin', 'hook'].includes(kind)
      ? folder === '.claude-plugin'
        ? path.split('/').at(-3)
        : folder
      : plain(title) || fallback);
  const description =
    plain(metadata.description) || plain(title) || `${kind} from ${source.label}: ${name}`;
  const key = `github-${Buffer.from(`${source.repo}/${path}`).toString('base64url')}`;
  const url = `https://github.com/${source.repo}/blob/${revision}/${path.split('/').map(encodeURIComponent).join('/')}`;
  return [
    key,
    {
      name: key,
      kind,
      display_name: name,
      description: description.slice(0, 1000),
      homepage: url,
      repository: { type: 'git', url: `https://github.com/${source.repo}` },
      author: { name: source.repo.split('/')[0] },
      license: plain(metadata.license) || source.license || 'See source',
      categories: [source.label],
      tags: [source.platform, kind],
      installations: {},
      arguments: {},
      tools: [],
      examples: [],
      compatibility:
        plain(metadata.compatibility) ||
        (kind === 'workflow' && source.format === 'copilot'
          ? 'GitHub Agentic Workflows'
          : source.platform),
      provenance: {
        source: source.label,
        repo: source.repo,
        path,
        revision,
        fetchedAt,
        url,
        ...(metadataWarnings.length ? { metadataWarnings } : {}),
      },
    },
  ];
}

export function validateSources(manifest) {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.sources))
    throw new Error('Invalid sources manifest');
  const repos = new Set();
  for (const source of manifest.sources) {
    if (
      !/^[\w.-]+\/[\w.-]+$/.test(source.repo) ||
      !['skills', 'copilot', 'claude-plugins'].includes(source.format) ||
      source.repo.split('/').some((part) => ['.', '..'].includes(part)) ||
      typeof source.label !== 'string' ||
      typeof source.platform !== 'string' ||
      repos.has(source.repo)
    )
      throw new Error('Invalid or duplicate GitHub source');
    repos.add(source.repo);
  }
  return manifest.sources;
}

export async function fetchSource(source, fetcher = fetch, fetchedAt = new Date().toISOString()) {
  const request = async (url) => {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(30_000),
      headers: { 'User-Agent': 'MCPHub-catalog-import' },
    });
    if (!response.ok) throw new Error(`Source ${source.repo} failed: HTTP ${response.status}`);
    return response;
  };
  const head = await (
    await request(`https://api.github.com/repos/${source.repo}/commits/HEAD`)
  ).json();
  if (!/^[a-f0-9]{40}$/.test(head.sha)) throw new Error('Invalid source revision');
  const tree = await (
    await request(`https://api.github.com/repos/${source.repo}/git/trees/${head.sha}?recursive=1`)
  ).json();
  if (tree.truncated || !Array.isArray(tree.tree)) throw new Error('Incomplete GitHub source tree');
  const files = tree.tree.filter(
    (file) => file.type === 'blob' && classifySourcePath(source, file.path),
  );
  if (!files.length || files.length > 5000) throw new Error('Invalid source listing count');
  const entries = {};
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, files.length) }, async () => {
      while (index < files.length) {
        const file = files[index++];
        if (file.size > 512_000 || file.path.split('/').some((p) => p === '..'))
          throw new Error(`Invalid source file: ${file.path}`);
        const text = await (
          await request(
            `https://raw.githubusercontent.com/${source.repo}/${head.sha}/${file.path.split('/').map(encodeURIComponent).join('/')}`,
          )
        ).text();
        if (text.length > 512_000) throw new Error('Oversized source file');
        const [key, entry] = sourceEntry(source, file.path, text, head.sha, fetchedAt);
        entries[key] = entry;
      }
    }),
  );
  return { entries, repo: source.repo, revision: head.sha, count: files.length };
}

export async function importSources(options, fetcher = fetch) {
  const manifest = JSON.parse(await readFile(options.manifest, 'utf8'));
  const sources = validateSources(manifest);
  const fetchedAt = new Date().toISOString();
  const entries = {};
  const revisions = [];
  for (const source of sources) {
    const result = await fetchSource(source, fetcher, fetchedAt);
    Object.assign(entries, result.entries);
    revisions.push({ repo: result.repo, revision: result.revision, count: result.count });
  }
  for (const entry of Object.values(entries))
    if (!kinds.includes(entry.kind)) throw new Error('Invalid imported kind');
  const snapshot = {
    schemaVersion: 1,
    fetchedAt,
    sources: revisions,
    entries: Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))),
  };
  if (!options.check) {
    await mkdir(dirname(options.output), { recursive: true });
    const temporary = `${options.output}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
      await rename(temporary, options.output);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return snapshot;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      manifest: { type: 'string', default: resolve(root, 'catalog/sources.json') },
      output: { type: 'string', default: resolve(root, 'catalog/imported.json') },
      check: { type: 'boolean', default: false },
    },
  });
  importSources(values)
    .then((snapshot) =>
      console.log(
        JSON.stringify({
          entries: Object.keys(snapshot.entries).length,
          sources: snapshot.sources,
        }),
      ),
    )
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
