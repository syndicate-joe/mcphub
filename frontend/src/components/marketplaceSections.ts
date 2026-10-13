import {
  Network,
  BookOpen,
  Compass,
  Bot,
  Workflow,
  MessageSquare,
  FileText,
  Webhook,
  Package,
} from 'lucide-react';
import type { MarketplaceKind } from '../../../src/utils/marketplace.js';
export const marketplaceIcons = {
  mcp: Network,
  skill: BookOpen,
  directory: Compass,
  agent: Bot,
  workflow: Workflow,
  prompt: MessageSquare,
  instruction: FileText,
  hook: Webhook,
  plugin: Package,
} satisfies Record<MarketplaceKind, typeof Network>;
