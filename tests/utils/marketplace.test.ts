import {
  getMarketplaceKind,
  marketplaceKinds,
  filterMarketplaceEntries,
  countMarketplaceKinds,
  paginateMarketplaceEntries,
} from '../../src/utils/marketplace.js';

const base = {
  name: 'example',
  display_name: 'Example',
  description: 'Code review',
  categories: ['Dev Tools'],
  tags: ['review'],
};
const server = { ...base, installations: { npm: { command: 'npx', args: ['-y', 'example-mcp'] } } };
const skill = { ...base, name: 'skill', kind: 'skill' as const };
const directory = { ...base, name: 'directory' };

describe('marketplace sections', () => {
  it('classifies explicit skills and legacy skill installer commands separately from MCP servers', () => {
    expect(getMarketplaceKind(skill)).toBe('skill');
    expect(getMarketplaceKind({ ...server, categories: ['Agent Skills'] })).toBe('skill');
    expect(
      getMarketplaceKind({
        ...server,
        installations: { npm: { args: ['skills', 'add', 'owner/repo'] } },
      }),
    ).toBe('skill');
    expect(getMarketplaceKind(server)).toBe('mcp');
    expect(getMarketplaceKind(directory)).toBe('directory');
  });

  it('keeps inferred registry installers browse-only unless explicitly verified as MCP', () => {
    const inferred = { ...server, categories: ['Curated Registries'] };
    expect(getMarketplaceKind(inferred)).toBe('directory');
    expect(getMarketplaceKind({ ...inferred, kind: 'mcp' })).toBe('mcp');
  });

  it('applies search and category filters within a section without mixing types', () => {
    const entries = [
      server,
      skill,
      directory,
      { ...skill, name: 'other', description: 'Different', categories: ['Writing'], tags: [] },
    ];
    expect(filterMarketplaceEntries(entries, 'skill', 'review', 'Dev Tools', 'review')).toEqual([
      skill,
    ]);
    expect(filterMarketplaceEntries(entries, 'directory', 'review')).toEqual([directory]);
    expect(countMarketplaceKinds(entries)).toEqual({
      mcp: 1,
      skill: 2,
      directory: 1,
      agent: 0,
      workflow: 0,
      prompt: 0,
      instruction: 0,
      hook: 0,
      plugin: 0,
    });
  });

  it('keeps every new resource kind out of the MCP section and scopes source filtering', () => {
    const entries = marketplaceKinds
      .filter((kind) => kind !== 'mcp')
      .map((kind) => ({
        ...server,
        kind,
        name: kind,
        provenance: { source: 'Example source' },
        compatibility: 'Copilot',
      }));
    expect(filterMarketplaceEntries(entries, 'mcp')).toEqual([]);
    expect(
      filterMarketplaceEntries(entries, 'workflow', 'copilot', '', '', 'Example source'),
    ).toHaveLength(1);
    expect(filterMarketplaceEntries(entries, 'workflow', '', '', '', 'Other source')).toEqual([]);
    expect(getMarketplaceKind({ ...server, kind: 'plugin', categories: ['Agent Skills'] })).toBe(
      'plugin',
    );
  });

  it('filters before pagination and clamps stale pages when changing sections', () => {
    const entries = [
      ...Array.from({ length: 15 }, (_, i) => ({ ...server, name: `server-${i}` })),
      ...Array.from({ length: 12 }, (_, i) => ({ ...skill, name: `skill-${i}` })),
    ];
    const skills = filterMarketplaceEntries(entries, 'skill');
    const page = paginateMarketplaceEntries(skills, 2, 9);
    expect(page.entries).toHaveLength(3);
    expect(page.entries.every((entry) => getMarketplaceKind(entry) === 'skill')).toBe(true);
    expect(paginateMarketplaceEntries([directory], 7, 9).currentPage).toBe(1);
    expect(paginateMarketplaceEntries([], 7, 9)).toEqual({
      entries: [],
      currentPage: 1,
      totalPages: 1,
    });
  });
});
