import { useState } from 'react';
import { ArrowLeft, ExternalLink, Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MarketServer } from '@/types';
import {
  getMarketplaceKind,
  getMarketplaceDisplayName,
  marketplaceSectionKeys,
} from '../../../src/utils/marketplace.js';

import { marketplaceIcons } from './marketplaceSections';

export default function MarketplaceBrowseDetail({
  entry,
  onBack,
}: {
  entry: MarketServer;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const kind = getMarketplaceKind(entry);
  const skill = kind === 'skill';
  const key = marketplaceSectionKeys[kind];
  const Icon = marketplaceIcons[kind];
  const candidate = entry.homepage || entry.repository?.url;
  const source = candidate && /^https?:\/\//i.test(candidate) ? candidate : undefined;
  const args = entry.installations?.npm?.args;
  const command =
    skill &&
    args?.[0] === 'skills' &&
    args[1] === 'add' &&
    args.length === 3 &&
    /^[\w.-]+\/[\w.-]+$/.test(args[2])
      ? `npx skills add ${args[2]}`
      : undefined;

  const copyCommand = async () => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  };

  return (
    <div className="max-w-3xl">
      <button onClick={onBack} className="hub-btn ghost mb-5">
        <ArrowLeft size={15} aria-hidden="true" />
        {t('market.backToList')}
      </button>
      <div className="hub-card p-5 sm:p-7">
        <div className="flex items-center gap-2 mb-4" style={{ color: 'var(--hub-accent)' }}>
          <Icon size={20} aria-hidden="true" />
          <span className="hub-mono">{t(`market.sections.${key}`)}</span>
        </div>
        <h1 className="hub-h1 break-words">{getMarketplaceDisplayName(entry)}</h1>
        <p className="hub-sub mt-2">{entry.author?.name || t('market.unknown')}</p>
        <p className="my-6 leading-relaxed" style={{ color: 'var(--hub-ink-2)' }}>
          {entry.description}
        </p>
        <div className="flex flex-wrap gap-2 mb-6">
          {(entry.categories || []).map((category) => (
            <span key={category} className="hub-tag">
              {category}
            </span>
          ))}
        </div>
        {(entry.provenance || entry.compatibility || entry.license) && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 text-sm">
            {entry.compatibility && (
              <div>
                <dt className="hub-sub">{t('market.compatibility')}</dt>
                <dd>{entry.compatibility}</dd>
              </div>
            )}
            {entry.license && (
              <div>
                <dt className="hub-sub">{t('market.license')}</dt>
                <dd className="break-words">{entry.license}</dd>
              </div>
            )}
            {entry.provenance && (
              <>
                <div>
                  <dt className="hub-sub">{t('market.sourceLabel')}</dt>
                  <dd>{entry.provenance.source}</dd>
                </div>
                <div>
                  <dt className="hub-sub">{t('market.importedAt')}</dt>
                  <dd>{entry.provenance.fetchedAt.slice(0, 10)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="hub-sub">{t('market.sourceRevision')}</dt>
                  <dd className="hub-mono break-all">
                    {entry.provenance.repo} · {entry.provenance.revision.slice(0, 12)}
                    <br />
                    {entry.provenance.path}
                  </dd>
                </div>
              </>
            )}
          </dl>
        )}
        {!!entry.provenance?.metadataWarnings?.length && (
          <p className="hub-sub mb-4">{t('market.metadataReview')}</p>
        )}
        <div className="rounded-lg p-4 mb-5" style={{ background: 'var(--hub-bg-2)' }}>
          <h2 className="font-medium mb-2">{t('market.resourceUsageTitle')}</h2>
          <p className="text-sm" style={{ color: 'var(--hub-ink-2)' }}>
            {t(`market.sections.${key}Usage`)}
          </p>
          {command && (
            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <code className="hub-mono text-sm break-all flex-1">{command}</code>
              <button onClick={copyCommand} className="hub-btn">
                {copied ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <Copy size={14} aria-hidden="true" />
                )}
                {t(copied ? 'market.commandCopied' : 'market.copyCommand')}
              </button>
            </div>
          )}
          {copyError && (
            <p role="alert" className="text-sm mt-2">
              {t('market.copyFailed')}
            </p>
          )}
        </div>
        {source && (
          <a href={source} target="_blank" rel="noopener noreferrer" className="hub-btn primary">
            <ExternalLink size={15} aria-hidden="true" />
            {t(skill ? 'market.viewSkill' : 'market.viewDocumentation')}
          </a>
        )}
      </div>
    </div>
  );
}
