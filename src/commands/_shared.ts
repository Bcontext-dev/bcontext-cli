/**
 * Shared plumbing for the read/write commands: the per-command context, the
 * canonical command→route mapping (single source of truth for docs in P11-03
 * and assertions in P11-04), and small helpers (stdin, workspace, slug).
 */
import type { BcontextClient } from "../client.js";
import type { OutputMode } from "../output.js";
import { fail } from "../output.js";

export interface CommandCtx {
  client: BcontextClient;
  /** Resolved, guaranteed-present workspace slug. */
  workspace: string;
  /** Positionals AFTER the command name (args[0] is the first argument). */
  args: string[];
  flags: Record<string, string | boolean>;
  mode: OutputMode;
}

export interface CommandSpec {
  method: "GET" | "POST";
  /** Path template; `:id` is substituted per call. */
  path: string;
  /** Scope the backing route enforces (informational — server is the gate). */
  scope: string;
  summary: string;
}

/**
 * Each CLI command maps 1:1 to one existing route so behaviour, scope and
 * audit are identical across surfaces. Keep this in sync with the command
 * implementations — tests assert against it.
 */
export const COMMAND_SPECS: Record<string, CommandSpec> = {
  search: {
    method: "POST",
    path: "/mcp (search_nodes)",
    scope: "nodes:read",
    summary: "Search — one hit per node, matched H2 blocks nested with refs.",
  },
  get: {
    method: "POST",
    path: "/mcp (get_node)",
    scope: "nodes:read",
    summary: "Fetch one node with links, dependencies, and attachments.",
  },
  tree: {
    method: "POST",
    path: "/api/agents/context",
    scope: "agents:read",
    summary: "Compatibility view of semantic node hierarchy plus reusable tags.",
  },
  ask: {
    method: "POST",
    path: "/api/chat",
    scope: "chat:run",
    summary: "Ask the workspace agent (streamed answer + sources).",
  },
  create: {
    method: "POST",
    path: "/api/agents/write",
    scope: "agents:write",
    summary: "Create a node (per-kind H2 skeleton when body omitted).",
  },
  update: {
    method: "POST",
    path: "/mcp (update_node)",
    scope: "nodes:write",
    summary: "Patch a node; --if-updated-at gives 409-on-conflict safety.",
  },
  link: {
    method: "POST",
    path: "/mcp (link_nodes)",
    scope: "nodes:write",
    summary: "Create a typed edge (blocked_by/references/caused_by/relates_to).",
  },
  unlink: {
    method: "POST",
    path: "/mcp (unlink_nodes)",
    scope: "nodes:write",
    summary: "Remove a typed edge.",
  },
  skill: {
    method: "POST",
    path: "/api/skills/:id/run",
    scope: "chat:run",
    summary: "Run a skill node.",
  },
  mcp: {
    method: "POST",
    path: "/mcp (:tool)",
    scope: "per tool",
    summary: "Call any MCP tool directly — the parity escape hatch.",
  },
  toggle: {
    method: "POST",
    path: "/mcp (toggle_checklist_item)",
    scope: "nodes:write",
    summary: "Atomically check/uncheck one `- [ ]` item.",
  },
  changes: {
    method: "POST",
    path: "/mcp (list_changes)",
    scope: "nodes:read",
    summary: "Recent workspace changes; --since for incremental sync.",
  },
  unblocked: {
    method: "POST",
    path: "/mcp (list_nodes)",
    scope: "nodes:read",
    summary: "Tasks ready to start (no undone blockers).",
  },
  attach: {
    method: "POST",
    path: "/mcp (attach_file)",
    scope: "nodes:write",
    summary: "Attach an image file to a node.",
  },
};

/** Reads all of stdin as a UTF-8 string. */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Resolves the `--md` flag to content:
 *   absent              → undefined (leave content unchanged)
 *   --md / --md -       → read stdin
 *   --md=<text>         → literal text
 */
export async function resolveMarkdown(
  flags: Record<string, string | boolean>,
): Promise<string | undefined> {
  const v = flags.md;
  if (v === undefined) return undefined;
  if (v === true || v === "-") return readStdin();
  return String(v);
}

/** Slugifies a heading the same way the platform derives block ids. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Requires a positional argument, failing with usage when missing. */
export function requireArg(
  ctx: CommandCtx,
  index: number,
  name: string,
  usage: string,
): string {
  const v = ctx.args[index];
  if (!v) fail(`missing <${name}>. usage: ${usage}`, 2);
  return v;
}
