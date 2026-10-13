# Marketplace sources and resource types

All repository contributions for this customization target `syndicate-joe/mcphub`.
Do not open upstream pull requests or issues on behalf of this fork's owner.

## Included imports

`catalog/sources.json` selects four public repositories:

| Repository | Imported resources | Platform |
| --- | --- | --- |
| [anthropics/skills](https://github.com/anthropics/skills) | Individual `SKILL.md` entries | Agent Skills |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | Individual `SKILL.md` entries | Agent Skills |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | Skills, agents, workflows, instructions, hooks, plugin manifests; prompts when present | Copilot; workflows target GitHub Agentic Workflows |
| [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | Plugin manifests, agent definitions, command prompts, and skills | Claude Code |

The importer resolves each repository to a commit, rejects incomplete trees,
and reads only recognized metadata files at that commit. It neither installs
packages nor executes downloaded content. Canonical repository/path keys keep
same-named resources distinct and make repeated imports idempotent. Existing
collection-level listings remain separate from their individual skills.

Metadata includes the source URL, commit, file path, import time, platform, and
license where declared. A repository license is used only when recorded in the
source manifest. Missing licenses say `See source`; this is not an assertion of
redistribution rights. Platform-specific frontmatter can contain non-YAML fields.
Only listing fields are parsed; nonstandard listing values are preserved as text
and marked for review. Publisher provenance is not a security certification.

The saved `catalog/imported.json` snapshot ships with the hub, so browsing does
not depend on GitHub availability. A refresh replaces the snapshot only after
all selected sources succeed. HTTP errors, incomplete trees, oversized files,
and malformed manifests preserve the previous snapshot. Refresh is manual:

```sh
pnpm catalog:import
pnpm catalog:sync --check
pnpm catalog:sync
pnpm catalog:test
```

`catalog:import --check` fetches and validates without writing. Imports are
metadata-only; installation is a separate action in the supported assistant or
workflow platform. No scheduled refresh or automatic installation is enabled.
The runtime combines the selected base, curated directory links, the imported
snapshot, and finally fork overrides/removals. The offline refresh uses the same
precedence. Fork customizations continue to win.

## Additional researched sources

These are linked source references in `catalog/directories.json`, rather than
claims that their catalogs have been mirrored:

| Source | Useful items | Requirement or follow-up |
| --- | --- | --- |
| [Official MCP Registry](https://registry.modelcontextprotocol.io/docs) | MCP server packages and remote connection metadata | Existing hub source and refresh adapter |
| [Docker MCP Registry](https://github.com/docker/mcp-registry) | Container server definitions | Next candidate for a schema-specific adapter; do not expose a Docker socket just to browse |
| [Skills Hub](https://skills-hub.ai/mcp-skills) | Skill discovery | Existing connected MCP search; no catalog mirror yet |
| [skills.sh API](https://www.skills.sh/docs/api) | Skills, curated listings, and popularity | Requires Vercel OIDC; no unauthenticated endpoint assumed |
| [Glama Directory API](https://glama.ai/mcp/reference) | MCP servers and remote connectors | API key, visible source credit, and per-item Glama links |
| [Smithery registry SDK](https://www.npmjs.com/package/@smithery/registry) | MCP server discovery and deployments | Authentication and endpoint validation |
| [n8n templates](https://n8n.io/workflows/) | Automation workflow templates | Link/review exported workflows first; no undocumented bulk endpoint assumed |
| [Dify Marketplace](https://marketplace.dify.ai/) | Plugins, agent strategies, triggers, workflow templates | Platform-specific metadata and a supported export/feed need validation |
| [Awesome MCP Servers](https://github.com/punkpeye/awesome-mcp-servers) | Additional community server discovery | Reference list; verify publisher connection instructions |
| [Agent Skills specification](https://agentskills.io/specification) | Compatibility and packaging guidance | Reference documentation, not an installable skill |

Prompts, instructions, hooks, and plugins now have dedicated sections in addition
to servers, skills, agents, workflows, and directory references. Future useful
extensions include reusable evaluation suites, knowledge/context packs, and
platform-specific workflow templates. They need a concrete source schema and
meaningful usage view before being introduced as new item kinds.
