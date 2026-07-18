import { flagStr } from "../args.js";
import { AuthError } from "../client.js";
import { fail, printResult } from "../output.js";
import { type CommandCtx, resolveMarkdown } from "./_shared.js";

export const CREATABLE_KINDS = [
  "doc",
  "task",
  "decision",
  "meeting",
  "bug",
  "adr",
  "entity",
  "skill",
] as const;

/**
 * `bcontext create --kind <k> --title <t> [--parent <id>] [--md -]`
 * → MCP create_node: same envelope as every agent surface — per-kind H2
 * skeleton when the body is omitted, default todo status for task/bug,
 * and the async-indexing hint (`~15s until searchable`).
 */
export async function create(ctx: CommandCtx): Promise<void> {
  const kind = flagStr(ctx.flags, "kind");
  const title = flagStr(ctx.flags, "title");
  if (!kind || !CREATABLE_KINDS.includes(kind as (typeof CREATABLE_KINDS)[number])) {
    fail(`--kind must be one of: ${CREATABLE_KINDS.join(", ")}. Folders were replaced by reusable tags.`, 2);
  }
  if (!title) fail("--title is required", 2);
  rejectLegacyCategory(ctx.flags);

  const content_md = await resolveMarkdown(ctx.flags);
  const args: Record<string, unknown> = { title, kind };
  const parent = flagStr(ctx.flags, "parent");
  const tagIds = csv(flagStr(ctx.flags, "tag-ids"));
  const status = flagStr(ctx.flags, "status");
  const priority = flagStr(ctx.flags, "priority");
  // parent_id is optional semantic hierarchy between real nodes. It never
  // creates a container and root-like sentinels simply mean no parent.
  if (parent && !isRoot(parent)) args.parent_id = parent;
  if (ctx.flags["tag-ids"] !== undefined) args.tag_ids = tagIds;
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

function rejectLegacyCategory(flags: Record<string, string | boolean>): void {
  if (flags.category !== undefined) {
    fail("--category was removed. Assign reusable workspace tags with --tag-ids <id,id>.", 2);
  }
}

function csv(value: string | undefined): string[] {
  return [...new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean))].sort();
}

function isRoot(value: string): boolean {
  return ["root", "none", "null"].includes(value.toLowerCase());
}

function summarize(node: unknown): string {
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    return `created ${o.kind ?? "node"} ${o.id ?? ""} — ${o.title ?? ""}`.trim();
  }
  return "created";
}
