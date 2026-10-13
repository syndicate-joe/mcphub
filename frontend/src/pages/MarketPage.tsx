import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Search,
  AlertCircle,
  X,
  ChevronDown,
  Network,
  BookOpen,
  Compass,
  ExternalLink,
} from 'lucide-react';
import { MarketServer, ServerConfig, RegistryServerEntry, RegistryServerData } from '@/types';
import { useMarketData } from '@/hooks/useMarketData';
import { useRegistryData } from '@/hooks/useRegistryData';
import { useToast } from '@/contexts/ToastContext';
import { apiPost } from '@/utils/fetchInterceptor';
import { slugifyServerName } from '@/utils/serverName';
import MarketServerCard from '@/components/MarketServerCard';
import MarketplaceBrowseCard from '@/components/MarketplaceBrowseCard';
import MarketplaceBrowseDetail from '@/components/MarketplaceBrowseDetail';
import { getMarketplaceKind, type MarketplaceKind } from '../../../src/utils/marketplace.js';
import MarketServerDetail from '@/components/MarketServerDetail';
import RegistryServerCard from '@/components/RegistryServerCard';
import RegistryServerDetail from '@/components/RegistryServerDetail';
import Pagination from '@/components/ui/Pagination';
import CursorPagination from '@/components/ui/CursorPagination';

const MarketPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { serverName } = useParams<{ serverName?: string }>();
  const { showToast } = useToast();

  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get('section');
  const currentSection: MarketplaceKind =
    sectionParam === 'skill' || sectionParam === 'directory' ? sectionParam : 'mcp';
  const currentTab: 'local' | 'registry' =
    currentSection === 'mcp' && searchParams.get('tab') === 'registry' ? 'registry' : 'local';

  const {
    servers: localServers,
    allServers: allLocalServers,
    sectionEntries,
    sectionCounts,
    clearFilters: clearLocalFilters,
    categories: localCategories,
    loading: localLoading,
    error: localError,
    setError: setLocalError,
    searchServers: searchLocalServers,
    filterByCategory: filterLocalByCategory,
    selectedCategory: selectedLocalCategory,
    selectedTag: selectedLocalTag,
    installServer: installLocalServer,
    fetchServerByName: fetchLocalServerByName,
    isServerInstalled,
    currentPage: localCurrentPage,
    totalPages: localTotalPages,
    changePage: changeLocalPage,
    serversPerPage: localServersPerPage,
    changeServersPerPage: changeLocalServersPerPage,
  } = useMarketData(currentSection);

  const {
    servers: registryServers,
    allServers: allRegistryServers,
    loading: registryLoading,
    error: registryError,
    setError: setRegistryError,
    searchServers: searchRegistryServers,
    clearSearch: clearRegistrySearch,
    fetchServerByName: fetchRegistryServerByName,
    fetchServerVersions: fetchRegistryServerVersions,
    currentPage: registryCurrentPage,
    totalPages: registryTotalPages,
    hasNextPage: registryHasNextPage,
    hasPreviousPage: registryHasPreviousPage,
    changePage: changeRegistryPage,
    goToNextPage: goToRegistryNextPage,
    goToPreviousPage: goToRegistryPreviousPage,
    serversPerPage: registryServersPerPage,
    changeServersPerPage: changeRegistryServersPerPage,
  } = useRegistryData();

  const [selectedServer, setSelectedServer] = useState<MarketServer | null>(null);
  const [selectedRegistryServer, setSelectedRegistryServer] = useState<RegistryServerEntry | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [registrySearchQuery, setRegistrySearchQuery] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installedRegistryServers, setInstalledRegistryServers] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const loadServerDetails = async () => {
      if (serverName) {
        setSelectedServer(null);
        setSelectedRegistryServer(null);
        if (currentTab === 'registry') {
          const serverEntry = await fetchRegistryServerByName(serverName);
          if (!active) return;
          if (serverEntry) setSelectedRegistryServer(serverEntry);
          else navigate('/market?tab=registry');
        } else {
          const server = await fetchLocalServerByName(serverName);
          if (!active) return;
          if (server) {
            const kind = getMarketplaceKind(server);
            if (kind !== currentSection) {
              navigate(`/market/${encodeURIComponent(server.name)}?section=${kind}&tab=local`, {
                replace: true,
              });
            }
            setSelectedServer(server);
          } else navigate('/market?tab=local');
        }
      } else {
        setSelectedServer(null);
        setSelectedRegistryServer(null);
      }
    };
    loadServerDetails();
    return () => {
      active = false;
    };
  }, [
    serverName,
    currentTab,
    currentSection,
    fetchLocalServerByName,
    fetchRegistryServerByName,
    navigate,
  ]);

  const switchTab = (tab: 'local' | 'registry') => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', tab);
    newParams.set('section', 'mcp');
    setSearchParams(newParams);
    if (serverName) navigate('/market?' + newParams.toString());
  };

  const switchSection = (section: MarketplaceKind) => {
    clearLocalFilters();
    setSearchQuery('');
    navigate(`/market?section=${section}&tab=local`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentTab === 'local') searchLocalServers(searchQuery);
    else if (currentTab === 'registry') searchRegistryServers(registrySearchQuery);
  };

  const handleCategoryClick = (category: string) => {
    if (currentTab === 'local') filterLocalByCategory(category);
  };

  const handleClearFilters = () => {
    if (currentTab === 'local') {
      setSearchQuery('');
      clearLocalFilters();
    } else if (currentTab === 'registry') {
      setRegistrySearchQuery('');
      clearRegistrySearch();
    }
  };

  const handleServerClick = (server: MarketServer | RegistryServerEntry) => {
    if (currentTab === 'registry') {
      const registryServer = server as RegistryServerEntry;
      const name = registryServer.server?.name;
      if (name) navigate(`/market/${encodeURIComponent(name)}?tab=registry`);
    } else {
      const marketServer = server as MarketServer;
      navigate(
        `/market/${encodeURIComponent(marketServer.name)}?section=${getMarketplaceKind(marketServer)}&tab=local`,
      );
    }
  };

  const handleBackToList = () => navigate(`/market?section=${currentSection}&tab=${currentTab}`);

  const handleLocalInstall = async (server: MarketServer, config: ServerConfig) => {
    try {
      setInstalling(true);
      const success = await installLocalServer(server, config);
      if (success) {
        showToast(t('market.installSuccess', { serverName: server.display_name }), 'success');
      }
    } finally {
      setInstalling(false);
    }
  };

  const handleRegistryInstall = async (server: RegistryServerData, config: ServerConfig) => {
    try {
      setInstalling(true);
      // Registry names are reverse-DNS (`io.github.user/weather`); the `/` is
      // not part of the MCP tool-name charset, so slugify before creating.
      const payload = { name: slugifyServerName(server.name), config };
      const result = await apiPost('/servers', payload);
      if (!result.success) {
        showToast(result?.message || t('server.addError'), 'error');
        return;
      }
      setInstalledRegistryServers((prev) => new Set(prev).add(server.name));
      showToast(t('registry.installSuccess', { name: server.title || server.name }), 'success');
    } catch (error) {
      showToast(
        t('registry.installError', {
          error: error instanceof Error ? error.message : String(error),
        }),
        'error',
      );
    } finally {
      setInstalling(false);
    }
  };

  const handlePageChange = (page: number) => {
    if (currentTab === 'local') changeLocalPage(page);
    else changeRegistryPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleChangeItemsPerPage = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = parseInt(e.target.value, 10);
    if (currentTab === 'local') changeLocalServersPerPage(v);
    else changeRegistryServersPerPage(v);
  };

  if (selectedServer) {
    if (getMarketplaceKind(selectedServer) !== 'mcp')
      return (
        <MarketplaceBrowseDetail
          key={selectedServer.name}
          entry={selectedServer}
          onBack={handleBackToList}
        />
      );
    return (
      <MarketServerDetail
        server={selectedServer}
        onBack={handleBackToList}
        onInstall={handleLocalInstall}
        installing={installing}
        isInstalled={isServerInstalled(selectedServer.name)}
      />
    );
  }

  if (selectedRegistryServer) {
    return (
      <RegistryServerDetail
        serverEntry={selectedRegistryServer}
        onBack={handleBackToList}
        onInstall={handleRegistryInstall}
        installing={installing}
        isInstalled={installedRegistryServers.has(selectedRegistryServer.server.name)}
        fetchVersions={fetchRegistryServerVersions}
      />
    );
  }

  const isLocalTab = currentTab === 'local';
  const isRegistryTab = currentTab === 'registry';
  const servers = isLocalTab ? localServers : registryServers;
  const allServers = isLocalTab ? allLocalServers : allRegistryServers;
  const categories = isLocalTab ? localCategories : [];
  const loading = isLocalTab ? localLoading : registryLoading;
  const showSidebar = isLocalTab && categories.length > 0;
  const error = isLocalTab ? localError : registryError;
  const setError = isLocalTab ? setLocalError : setRegistryError;
  const selectedCategory = isLocalTab ? selectedLocalCategory : '';
  const selectedTag = isLocalTab ? selectedLocalTag : '';
  const currentPage = isLocalTab ? localCurrentPage : registryCurrentPage;
  const totalPages = isLocalTab ? localTotalPages : registryTotalPages;
  const serversPerPage = isLocalTab ? localServersPerPage : registryServersPerPage;

  const sections: { id: MarketplaceKind; key: string; icon: typeof Network }[] = [
    { id: 'mcp', key: 'servers', icon: Network },
    { id: 'skill', key: 'skills', icon: BookOpen },
    { id: 'directory', key: 'directory', icon: Compass },
  ];
  const sectionKey =
    currentSection === 'mcp' ? 'servers' : currentSection === 'skill' ? 'skills' : 'directory';

  const tabs: {
    id: 'local' | 'registry';
    label: string;
    sourceLabel: string;
    sourceUrl: string;
  }[] = [
    {
      id: 'local',
      label: t('market.curatedSource'),
      sourceLabel: 'MCPM',
      sourceUrl: 'https://mcpm.sh',
    },
    {
      id: 'registry',
      label: t('market.officialRegistrySource'),
      sourceLabel: t('market.officialRegistrySource'),
      sourceUrl: 'https://registry.modelcontextprotocol.io',
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="hub-h1">{t('nav.market')}</h1>
          <p className="hub-sub">{t('market.sections.intro')}</p>
        </div>
      </div>

      <nav
        aria-label={t('market.sections.navigation')}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6"
      >
        {sections.map(({ id, key, icon: Icon }) => (
          <button
            key={id}
            onClick={() => switchSection(id)}
            aria-pressed={currentSection === id}
            className="hub-card text-left p-4 transition-colors"
            style={{
              borderColor: currentSection === id ? 'var(--hub-accent)' : 'var(--hub-line)',
              background: currentSection === id ? 'var(--hub-accent-soft)' : 'var(--hub-surface)',
            }}
          >
            <span className="flex items-center justify-between gap-3 mb-2">
              <Icon size={19} aria-hidden="true" />
              <span className="hub-mono text-sm">{localLoading ? '—' : sectionCounts[id]}</span>
            </span>
            <span className="block font-medium">{t(`market.sections.${key}`)}</span>
            <span
              className="block text-xs mt-1 leading-relaxed"
              style={{ color: 'var(--hub-ink-2)' }}
            >
              {t(`market.sections.${key}Description`)}
            </span>
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="hub-sect">{t(`market.sections.${sectionKey}`)}</h2>
        {currentSection === 'mcp' && (
          <nav aria-label={t('market.sourcesNavigation')} className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                aria-pressed={currentTab === tab.id}
                className={`hub-btn ${currentTab === tab.id ? 'primary' : 'ghost'}`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}
      </div>
      {currentSection === 'mcp' && (
        <p className="text-xs mb-5" style={{ color: 'var(--hub-ink-3)' }}>
          {t('market.sourceLabel')}:{' '}
          <a
            href={tabs.find((tab) => tab.id === currentTab)?.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline"
          >
            {tabs.find((tab) => tab.id === currentTab)?.sourceLabel}
            <ExternalLink size={11} aria-hidden="true" />
          </a>
        </p>
      )}

      {currentSection !== 'mcp' && (
        <p className="hub-sub mb-5">
          {t(
            currentSection === 'skill' ? 'market.skillDescription' : 'market.directoryDescription',
          )}
        </p>
      )}

      {error && (
        <div
          className="hub-card flex items-center justify-between gap-3 mb-4"
          style={{
            padding: '10px 14px',
            borderColor: 'oklch(0.85 0.1 25)',
            background: 'oklch(0.97 0.03 25)',
            color: 'oklch(0.4 0.18 25)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle size={14} className="flex-shrink-0" />
            <span className="truncate text-[13px]">{error}</span>
          </div>
          <button className="hub-icon-btn sm" onClick={() => setError(null)}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* Search bar */}
      {(isLocalTab || isRegistryTab) && (
        <form
          aria-label={t('market.searchForm')}
          onSubmit={handleSearch}
          className="hub-card flex items-center gap-2 px-3 mb-5"
          style={{ padding: 6 }}
        >
          <Search size={16} style={{ color: 'var(--hub-ink-3)', margin: '0 6px 0 6px' }} />
          <input
            type="text"
            aria-label={t(`market.sections.${sectionKey}Search`)}
            value={isRegistryTab ? registrySearchQuery : searchQuery}
            onChange={(e) => {
              if (isRegistryTab) setRegistrySearchQuery(e.target.value);
              else setSearchQuery(e.target.value);
            }}
            placeholder={
              isRegistryTab
                ? t('registry.searchPlaceholder')
                : t(`market.sections.${sectionKey}Search`)
            }
            className="min-w-0 flex-1 bg-transparent outline-none"
            style={{ height: 32, fontSize: 14, color: 'var(--hub-ink)' }}
          />
          <button type="submit" className="hub-btn">
            {t('common.search')}
          </button>
          {((isLocalTab && (searchQuery || selectedCategory || selectedTag)) ||
            (isRegistryTab && registrySearchQuery)) && (
            <button type="button" onClick={handleClearFilters} className="hub-btn ghost">
              {t('common.clear')}
            </button>
          )}
        </form>
      )}

      <div className={showSidebar ? 'grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)]' : ''}>
        {/* Categories sidebar (local only) */}
        {showSidebar && (
          <aside aria-label={t('market.categories')}>
            <h3 className="hub-sect mb-2">{t('market.categories')}</h3>
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => filterLocalByCategory('')}
                className="flex items-center justify-between transition-colors text-[13px]"
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: !selectedCategory ? 'var(--hub-surface)' : 'transparent',
                  color: !selectedCategory ? 'var(--hub-ink)' : 'var(--hub-ink-2)',
                  border: '1px solid ' + (!selectedCategory ? 'var(--hub-line)' : 'transparent'),
                }}
              >
                <span>{t('common.all')}</span>
                <span className="hub-mono" style={{ fontSize: 11, color: 'var(--hub-ink-3)' }}>
                  {sectionEntries.length}
                </span>
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleCategoryClick(cat)}
                  className="flex items-center justify-between transition-colors text-[13px]"
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: selectedCategory === cat ? 'var(--hub-surface)' : 'transparent',
                    color: selectedCategory === cat ? 'var(--hub-ink)' : 'var(--hub-ink-2)',
                    border:
                      '1px solid ' + (selectedCategory === cat ? 'var(--hub-line)' : 'transparent'),
                  }}
                >
                  <span className="truncate">{cat}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* Grid */}
        <div>
          {loading ? (
            <div className="hub-card p-6 text-center" style={{ color: 'var(--hub-ink-3)' }}>
              {t('app.loading')}
            </div>
          ) : servers.length === 0 ? (
            <div className="hub-card p-10 text-center" style={{ color: 'var(--hub-ink-3)' }}>
              {isLocalTab ? t('market.sectionEmpty') : t('registry.noServers')}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {servers.map((server) =>
                  isLocalTab && currentSection !== 'mcp' ? (
                    <MarketplaceBrowseCard
                      key={(server as MarketServer).name}
                      entry={server as MarketServer}
                      onClick={handleServerClick}
                    />
                  ) : isLocalTab ? (
                    <MarketServerCard
                      key={
                        isLocalTab
                          ? (server as MarketServer).name
                          : `${(server as RegistryServerEntry).server.name}-${(server as RegistryServerEntry).server.version}`
                      }
                      server={server as MarketServer}
                      onClick={handleServerClick}
                    />
                  ) : (
                    <RegistryServerCard
                      key={
                        isLocalTab
                          ? (server as MarketServer).name
                          : `${(server as RegistryServerEntry).server.name}-${(server as RegistryServerEntry).server.version}`
                      }
                      serverEntry={server as RegistryServerEntry}
                      onClick={handleServerClick}
                    />
                  ),
                )}
              </div>

              <div
                className="flex flex-wrap items-center gap-3 mt-4 text-[12px]"
                style={{ color: 'var(--hub-ink-3)' }}
              >
                <div className="w-full sm:flex-[2]">
                  {isLocalTab
                    ? t('market.showingEntries', {
                        from: (currentPage - 1) * serversPerPage + 1,
                        to: Math.min(currentPage * serversPerPage, allServers.length),
                        total: allServers.length,
                      })
                    : t('registry.showing', {
                        from: (currentPage - 1) * serversPerPage + 1,
                        to: (currentPage - 1) * serversPerPage + servers.length,
                        total: allServers.length + (registryHasNextPage ? '+' : ''),
                      })}
                </div>
                <div className="w-full sm:flex-[4] flex justify-center overflow-x-auto">
                  {isRegistryTab ? (
                    <CursorPagination
                      currentPage={currentPage}
                      hasNextPage={registryHasNextPage}
                      hasPreviousPage={registryHasPreviousPage}
                      onNextPage={goToRegistryNextPage}
                      onPreviousPage={goToRegistryPreviousPage}
                    />
                  ) : (
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={handlePageChange}
                    />
                  )}
                </div>
                <div className="w-full sm:flex-[2] flex items-center justify-end gap-2">
                  <label htmlFor="perPage">
                    {isLocalTab ? t('market.perPage') : t('registry.perPage')}:
                  </label>
                  <div className="relative">
                    <select
                      id="perPage"
                      value={serversPerPage}
                      onChange={handleChangeItemsPerPage}
                      className="hub-input pr-7"
                      style={{ height: 26, width: 70, padding: '0 6px', fontSize: 12 }}
                    >
                      <option value="6">6</option>
                      <option value="9">9</option>
                      <option value="12">12</option>
                      <option value="24">24</option>
                    </select>
                    <ChevronDown
                      size={11}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'var(--hub-ink-3)' }}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarketPage;
