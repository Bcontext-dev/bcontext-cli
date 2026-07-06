import { flagStr } from "../args.js";
import { AuthError } from "../client.js";
import { fail, printResult } from "../output.js";
import { type CommandCtx, resolveMarkdown } from "./_shared.js";

const KINDS = [
  "folder",
  "doc",
  "task",
  "decision",
  "meeting",
  "bug",
  "adr",
  "entity",
  "skill",
];

/**
 * `bcontext create --kind <k> --title <t> [--parent <id>] [--md -]`
 * → MCP create_node: same envelope as every agent surface — per-kind H2
 * skeleton when the body is omitted, default todo status for task/bug,
 * and the async-indexing hint (`~15s until searchable`).
 */
export async function create(ctx: CommandCtx): Promise<void> {
  const kind = flagStr(ctx.flags, "kind");
  const title = flagStr(ctx.flags, "title");
  if (!kind || !KINDS.includes(kind)) {
    fail(`--kind must be one of: ${KINDS.join(", ")}`, 2);
  }
  if (!title) fail("--title is required", 2);

  const content_md = await resolveMarkdown(ctx.flags);
  const args: Record<string, unknown> = { title, kind };
  const parent = flagStr(ctx.flags, "parent");
  const category = flagStr(ctx.flags, "category");
  const status = flagStr(ctx.flags, "status");
  const priority = flagStr(ctx.flags, "priority");
  if (parent) args.parent_id = parent;
  if (category) args.category = category;
  if (status) args.status = status;
  if (priority) args.priority = priority;
  if (content_md !== undefined) args.content_md = content_md;

  try {
    const result = await ctx.client.mcpCall<{ node?: unknown; indexing?: string }>(
      "create_node",
      args,
      ctx.workspace,
    );
    printResult(result as object, ctx.mode, () => summarize(result.node));
  } catch (err) {
    if (err instanceof AuthError) fail(err.message, 1);
    throw err;
  }
}

function summarize(node: unknown): string {
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    return `created ${o.kind ?? "node"} ${o.id ?? ""} — ${o.title ?? ""}`.trim();
  }
  return "created";
}
