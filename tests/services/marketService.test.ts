import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getMarketServers,
  getServersJsonPath,
  searchMarketServers,
} from '../../src/services/marketService.js';

describe('recovered marketplace catalog', () => {
  const previous = process.env.MCPHUB_CATALOG_PATH;
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mcphub-market-'));
    process.env.MCPHUB_CATALOG_PATH = path.join(directory, 'servers.json');
    fs.writeFileSync(
      process.env.MCPHUB_CATALOG_PATH,
      JSON.stringify({
        fresh: { name: 'fresh', display_name: 'Fresh server', description: 'New upstream entry' },
        elevenlabs: { name: 'elevenlabs', display_name: 'Removed', description: 'Removed entry' },
      }),
    );
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.MCPHUB_CATALOG_PATH;
    else process.env.MCPHUB_CATALOG_PATH = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('loads an explicit catalog and preserves the recovered overlay and removals', () => {
    expect(getServersJsonPath()).toBe(process.env.MCPHUB_CATALOG_PATH);
    const catalog = getMarketServers();
    expect(catalog.fresh).toBeDefined();
    expect(catalog.elevenlabs).toBeUndefined();
    expect(catalog['skill-anthropics-skills'].kind).toBe('skill');
    expect(searchMarketServers('Agent Skill').length).toBeGreaterThanOrEqual(90);
  });
  it('merges bundled source snapshots with preserved provenance and separate resource kinds', () => {
    const catalog = getMarketServers();
    const imported = Object.values(catalog).find((entry) => entry.kind === 'workflow');
    expect(imported).toBeDefined();
    expect(imported?.provenance?.revision).toMatch(/^[a-f0-9]{40}$/);
    expect(imported?.installations).toEqual({});
    expect(catalog['source-n8n-templates'].kind).toBe('directory');
    expect(catalog['skill-anthropics-skills'].kind).toBe('skill');
  });
});
