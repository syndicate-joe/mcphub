export const marketplaceKinds = [
  'mcp',
  'skill',
  'agent',
  'workflow',
  'prompt',
  'instruction',
  'hook',
  'plugin',
  'directory',
] as const;
export type MarketplaceKind = (typeof marketplaceKinds)[number];
export const marketplaceSectionKeys: Record<MarketplaceKind, string> = {
  mcp: 'servers',
  skill: 'skills',
  agent: 'agents',
  workflow: 'workflows',
  prompt: 'prompts',
  instruction: 'instructions',
  hook: 'hooks',
  plugin: 'plugins',
  directory: 'directory',
};
export interface MarketplaceProvenance {
  source: string;
  repo: string;
  path: string;
  revision: string;
  fetchedAt: string;
  url: string;
  metadataWarnings?: string[];
}

interface MarketplaceEntry {
  kind?: MarketplaceKind;
  name: string;
  display_name: string;
  description: string;
  categories?: string[];
  tags?: string[];
  provenance?: { source: string };
  compatibility?: string;
  installations?: Record<string, { command?: string; args?: string[] }>;
}

export function getMarketplaceKind(entry: MarketplaceEntry): MarketplaceKind {
  if (entry.kind && entry.kind !== 'mcp') return entry.kind;
  if (entry.categories?.includes('Agent Skills')) return 'skill';
  if (
    Object.values(entry.installations || {}).some(
      (install) => install.args?.[0] === 'skills' && install.args?.[1] === 'add',
    )
  )
    return 'skill';
  if (entry.kind !== 'mcp' && entry.categories?.includes('Curated Registries')) return 'directory';
  return Object.keys(entry.installations || {}).length ? 'mcp' : 'directory';
}

export function filterMarketplaceEntries<T extends MarketplaceEntry>(
  entries: T[],
  kind: MarketplaceKind,
  query = '',
  category = '',
  tag = '',
  source = '',
): T[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    if (getMarketplaceKind(entry) !== kind) return false;
    if (source && (entry.provenance?.source || '__existing__') !== source) return false;
    if (category && !entry.categories?.includes(category)) return false;
    if (tag && !entry.tags?.includes(tag)) return false;
    const text = [
      entry.name,
      entry.display_name,
      entry.description,
      entry.provenance?.source || '',
      entry.compatibility || '',
      ...(entry.categories || []),
      ...(entry.tags || []),
    ]
      .join(' ')
      .toLowerCase();
    return terms.length === 0 || terms.some((term) => text.includes(term));
  });
}

export function countMarketplaceKinds(entries: MarketplaceEntry[]) {
  return entries.reduce(
    (counts, entry) => {
      counts[getMarketplaceKind(entry)]++;
      return counts;
    },
    Object.fromEntries(marketplaceKinds.map((kind) => [kind, 0])) as Record<
      MarketplaceKind,
      number
    >,
  );
}

export function getMarketplaceDisplayName(entry: MarketplaceEntry): string {
  const name = entry.display_name || entry.name;
  return getMarketplaceKind(entry) === 'skill' ? name.replace(/\s+\(Agent Skill\)$/i, '') : name;
}

export function paginateMarketplaceEntries<T>(entries: T[], page: number, perPage: number) {
  const totalPages = Math.max(1, Math.ceil(entries.length / perPage));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  return {
    currentPage,
    totalPages,
    entries: entries.slice((currentPage - 1) * perPage, currentPage * perPage),
  };
}
