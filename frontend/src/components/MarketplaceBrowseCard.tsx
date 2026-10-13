import { BookOpen, Compass, ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MarketServer } from '@/types';
import { getMarketplaceKind, getMarketplaceDisplayName } from '../../../src/utils/marketplace.js';

export default function MarketplaceBrowseCard({
  entry,
  onClick,
}: {
  entry: MarketServer;
  onClick: (entry: MarketServer) => void;
}) {
  const { t } = useTranslation();
  const skill = getMarketplaceKind(entry) === 'skill';
  const Icon = skill ? BookOpen : Compass;
  return (
    <article className="hub-card flex flex-col overflow-hidden">
      <div className="p-4 flex-1">
        <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--hub-accent)' }}>
          <Icon size={17} aria-hidden="true" />
          <span className="hub-mono text-xs">
            {t(skill ? 'market.sections.skills' : 'market.sections.directory')}
          </span>
        </div>
        <h3 className="font-medium mb-1 break-words">{getMarketplaceDisplayName(entry)}</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--hub-ink-3)' }}>
          {entry.author?.name || t('market.unknown')}
        </p>
        <p className="text-sm line-clamp-3" style={{ color: 'var(--hub-ink-2)' }}>
          {entry.description}
        </p>
        <div className="flex flex-wrap gap-1 mt-3">
          {(entry.tags || []).slice(0, 3).map((tag) => (
            <span className="hub-tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      </div>
      <button className="hub-btn ghost m-2 justify-between" onClick={() => onClick(entry)}>
        {t(skill ? 'market.viewSkill' : 'market.viewDocumentation')}
        <ArrowUpRight size={14} aria-hidden="true" />
      </button>
    </article>
  );
}
