# Marketplace customization

This fork retains 365 added or changed entries and one removal recovered from a
570-entry Windows catalog. `overrides.json` records its baseline revision and
contains public listing metadata only. Hub settings and credentials are not part
of this snapshot. The original refresh script was empty, so refresh behavior has
been rebuilt rather than claimed as recovered.

The backend combines the selected catalog with this overlay. An explicit
`MCPHUB_CATALOG_PATH` takes priority, then `data/servers.json`, then the bundled
`servers.json`. Overlay entries win and recorded removals stay removed. The Docker
build also applies the overlay after its MCPM download. npm distributions include
the overlay. Upstream's live Official Registry tab remains available.

## Refresh

Run from the checkout with Node 20 or later:

```sh
pnpm catalog:sync --check
pnpm catalog:sync
pnpm catalog:sync --mcpm --registry
pnpm catalog:sync --skills ./my-skills.json
pnpm catalog:test
```

By default, refresh is offline and writes `data/servers.json`. `--check` validates
without writing. `--mcpm` refreshes from `https://mcpm.sh/api/servers.json`;
`--registry` paginates the official registry's latest active listings. Network or
validation failures abort before replacing the output. Writes use a temporary
file and rename. Nothing installs or launches an MCP server during refresh.

`--skills` accepts a reviewed JSON object in the same keyed listing format as
`servers.json`; imported entries receive `kind: "skill"`. Skill discovery from an
undocumented website endpoint is deliberately not assumed. Existing skill
listings retain their `skills.sh` links. Update the curated overlay or supply a
reviewed export when changing them.

Skills open their documentation instead of entering the MCP server installation
flow. Registry listings without launch configurations likewise open documentation;
use the live Registry tab for supported connection configuration. Registry imports
do not invent package commands, authentication, licenses, or official endorsements.

To update a customization, edit `overrides.json`, rerun validation, and review the
diff. To adopt a new upstream version of an overridden entry, remove that override.
To restore a removed listing, delete its name from `remove`.

## Linux rollout

Build this fork's image using its Dockerfile, bind host port `127.0.0.1:3080` to
container port `3000`, and mount a private Linux data copy at `/app/data`. Set
`MCPHUB_CATALOG_PATH=/app/data/servers.json` when selecting a specific catalog.
Back up the data before starting a newer hub version. Verify the listings and
downstream tools before switching clients. Do not mount Windows data read-write
or commit hub credentials. Filesystem tools need explicit project mounts; memory
needs persistent storage. This change does not deploy the hub or update clients.
