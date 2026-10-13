import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MarketServer, ApiResponse, ServerConfig } from '@/types';
import { apiGet, apiPost } from '../utils/fetchInterceptor';
import {
  getMarketplaceKind,
  filterMarketplaceEntries,
  countMarketplaceKinds,
  paginateMarketplaceEntries,
  type MarketplaceKind,
} from '../../../src/utils/marketplace.js';

export const useMarketData = (kind: MarketplaceKind = 'mcp') => {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<MarketServer[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installedServers, setInstalledServers] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [serversPerPage, setServersPerPage] = useState(9);

  const sectionEntries = useMemo(() => filterMarketplaceEntries(catalog, kind), [catalog, kind]);
  const allServers = useMemo(
    () =>
      filterMarketplaceEntries(
        catalog,
        kind,
        searchQuery,
        selectedCategory,
        selectedTag,
        selectedSource,
      ),
    [catalog, kind, searchQuery, selectedCategory, selectedTag, selectedSource],
  );
  const categories = useMemo(
    () =>
      [...new Set(sectionEntries.flatMap((s) => s.categories || []))]
        .filter(
          (category) => !sectionEntries.some((entry) => entry.provenance?.source === category),
        )
        .filter((category) => sectionEntries.some((entry) => !entry.categories?.includes(category)))
        .sort(),
    [sectionEntries],
  );
  const tags = useMemo(
    () => [...new Set(sectionEntries.flatMap((s) => s.tags || []))].sort(),
    [sectionEntries],
  );
  const sources = useMemo(
    () =>
      [
        ...new Set(sectionEntries.map((entry) => entry.provenance?.source || '__existing__')),
      ].sort(),
    [sectionEntries],
  );
  const filterBySource = useCallback((source: string) => {
    setSelectedSource(source);
    setPage(1);
  }, []);
  const sectionCounts = useMemo(() => countMarketplaceKinds(catalog), [catalog]);
  const pagination = useMemo(
    () => paginateMarketplaceEntries(allServers, page, serversPerPage),
    [allServers, page, serversPerPage],
  );

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategory('');
    setSelectedTag('');
    setSelectedSource('');
    setPage(1);
  }, []);
  useEffect(clearFilters, [kind, clearFilters]);

  const fetchMarketServers = useCallback(async () => {
    setLoading(true);
    try {
      const response: ApiResponse<MarketServer[]> = await apiGet('/market/servers');
      if (!response.success || !Array.isArray(response.data))
        throw new Error(t('market.fetchError'));
      setCatalog(response.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchServerByName = useCallback(
    async (name: string) => {
      try {
        const response: ApiResponse<MarketServer> = await apiGet(
          `/market/servers/${encodeURIComponent(name)}`,
        );
        if (!response.success || !response.data) throw new Error(t('market.serverNotFound'));
        return response.data;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [t],
  );

  const searchServers = useCallback((query: string) => {
    setSearchQuery(query);
    setPage(1);
  }, []);
  const filterByCategory = useCallback((category: string) => {
    setSelectedCategory(category);
    setSelectedTag('');
    setPage(1);
  }, []);
  const filterByTag = useCallback((tag: string) => {
    setSelectedTag(tag);
    setSelectedCategory('');
    setPage(1);
  }, []);
  const changePage = useCallback((value: number) => setPage(value), []);
  const changeServersPerPage = useCallback((value: number) => {
    setServersPerPage(value);
    setPage(1);
  }, []);

  // Fetch installed servers
  const fetchInstalledServers = useCallback(async () => {
    try {
      const data = await apiGet<{ success: boolean; data: any[] }>('/servers');

      if (data && data.success && Array.isArray(data.data)) {
        // Extract server names
        const installedServerNames = data.data.map((server: any) => server.name);
        setInstalledServers(installedServerNames);
      }
    } catch (err) {
      console.error('Error fetching installed servers', { err });
    }
  }, []);

  // Check if a server is already installed
  const isServerInstalled = useCallback(
    (serverName: string) => {
      return installedServers.includes(serverName);
    },
    [installedServers],
  );

  // Install server to the local environment
  const installServer = useCallback(
    async (server: MarketServer, customConfig: ServerConfig) => {
      if (getMarketplaceKind(server) !== 'mcp') {
        setError(
          t(
            getMarketplaceKind(server) === 'skill'
              ? 'market.skillDescription'
              : 'market.directoryDescription',
          ),
        );
        return false;
      }
      try {
        const installType = server.installations?.npm
          ? 'npm'
          : Object.keys(server.installations || {}).length > 0
            ? Object.keys(server.installations)[0]
            : null;

        if (!installType || !server.installations?.[installType]) {
          setError(t('market.noInstallationMethod'));
          return false;
        }

        const installation = server.installations[installType];

        // Prepare server configuration, merging with customConfig
        const serverConfig = {
          name: server.name,
          config:
            customConfig.type === 'stdio'
              ? {
                  command: customConfig.command || installation.command || '',
                  args: customConfig.args || installation.args || [],
                  env: { ...installation.env, ...customConfig.env },
                }
              : customConfig,
        };

        // Call the createServer API
        const result = await apiPost<{ success: boolean; message?: string }>(
          '/servers',
          serverConfig,
        );

        if (!result.success) {
          throw new Error(result.message || 'Failed to install server');
        }

        // Update installed servers list after successful installation
        await fetchInstalledServers();
        return true;
      } catch (err) {
        console.error('Error installing market server', { serverName: server.name, err });
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [t, fetchInstalledServers],
  );

  useEffect(() => {
    fetchMarketServers();
    fetchInstalledServers();
  }, [fetchMarketServers, fetchInstalledServers]);

  return {
    servers: pagination.entries,
    allServers,
    sectionEntries,
    sectionCounts,
    sources,
    selectedSource,
    filterBySource,
    categories,
    tags,
    selectedCategory,
    selectedTag,
    searchQuery,
    loading,
    error,
    setError,
    fetchMarketServers,
    fetchServerByName,
    searchServers,
    filterByCategory,
    filterByTag,
    clearFilters,
    installServer,
    currentPage: pagination.currentPage,
    totalPages: pagination.totalPages,
    serversPerPage,
    changePage,
    changeServersPerPage,
    isServerInstalled,
  };
};
