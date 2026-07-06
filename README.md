# @bcontext/cli

`bcontext` (alias `bx`) — the token-cheap agent surface for [Bcontext](https://bcontext.es) workspaces.

An MCP server injects its tool schema into the model's context on every turn; a shell command costs ~0 standing tokens. When your agent has a shell (Claude Code, Cursor, CI), prefer this CLI — keep MCP for hosted, shell-less clients. Same tokens, scopes, rate limits and audit trail on every surface.

## Install & authenticate

```bash
npx @bcontext/cli whoami            # one-off, no install

npm i -g @bcontext/cli
bcontext login --token bctx_live_…  # stored at ~/.config/bcontext/config.json (0600)
bcontext use my-workspace
```

Or configure via environment (CI / agent sandboxes):

```bash
export BCONTEXT_TOKEN="bctx_live_…"
export BCONTEXT_URL="https://bcontext.es"   # or your self-hosted origin
export BCONTEXT_WORKSPACE="my-workspace"
```

Precedence: flags > env > config file.

## Read

```bash
bx ask "what blocks the release and why?"   # synthesized answer, claims cited [N]; Sources on stderr
bx search "auth migration" --kind decision,adr
bx get <node-id>                            # node + backlinks + dependencies + attachments
bx tree
bx unblocked --kind task                    # ready work (no undone blockers)
bx changes --since 2026-07-06T10:00:00Z     # incremental change feed
```

## Write

```bash
bx create --kind decision --title "Postgres over ClickHouse"   # H2 skeleton pre-filled
echo "## Notes" | bx create --kind doc --title "Notes" --md -
bx update <id> --status done --if-updated-at <updated_at>      # 409 on conflict: re-fetch, rebase, retry
bx toggle <node-id> 2 --block action-items                     # atomic checkbox flip
bx link <task-id> <blocker-id> --relation blocked_by
bx attach <node-id> screenshot.png
```

## Escape hatch

Every MCP tool — present or future — without waiting for a subcommand:

```bash
bx mcp tools/list
bx mcp list_changes '{"node_id":"<id>"}'
```

## Docs

Full reference: [bcontext.es/docs/cli](https://bcontext.es/docs/cli) · Agent discovery: `/.well-known/agents.json` · `llms.txt`
