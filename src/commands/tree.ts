import { flagStr } from "../args.js";
import { failResponse, printResult } from "../output.js";
import type { CommandCtx } from "./_shared.js";

interface TreeNode {
  id?: string;
  parent_id?: string | null;
  kind?: string;
  title?: string;
  [k: string]: unknown;
}

/** `bcontext tree [--depth N]` → POST /api/agents/context (empty query) */
export async function tree(ctx: CommandCtx): Promise<void> {
  const depthRaw = flagStr(ctx.flags, "depth");
  const depth = depthRaw ? parseInt(depthRaw, 10) : undefined;

  const res = await ctx.client.request<{ tree?: TreeNode[] }>(
    "POST",
    "/api/agents/context",
    { body: { workspace: ctx.workspace, query: "", include_counts: false } },
  );
  if (!res.ok) failResponse(res);

  let nodes = res.data.tree ?? [];
  if (depth !== undefined && Number.isFinite(depth)) {
    nodes = pruneByDepth(nodes, depth);
  }

  printResult({ tree: nodes }, ctx.mode, () => renderTree(nodes));
}

/** Keeps nodes whose ancestor chain length is < depth. */
function pruneByDepth(nodes: TreeNode[], depth: number): TreeNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depthOf = (n: TreeNode): number => {
    let d = 0;
    let cur: TreeNode | undefined = n;
    const seen = new Set<string>();
    while (cur?.parent_id && !seen.has(cur.parent_id)) {
      seen.add(cur.parent_id);
      cur = byId.get(cur.parent_id);
      d++;
    }
    return d;
  };
  return nodes.filter((n) => depthOf(n) < depth);
}

/** Indented text view for --pretty. */
function renderTree(nodes: TreeNode[]): string {
  const children = new Map<string | null | undefined, TreeNode[]>();
  for (const n of nodes) {
    const key = n.parent_id ?? null;
    const arr = children.get(key) ?? [];
    arr.push(n);
    children.set(key, arr);
  }
  const lines: string[] = [];
  const walk = (parent: string | null, indent: number): void => {
    for (const n of children.get(parent) ?? []) {
      lines.push(`${"  ".repeat(indent)}[${n.kind ?? "?"}] ${n.title ?? n.id}`);
      if (n.id) walk(n.id, indent + 1);
    }
  };
  walk(null, 0);
  return lines.join("\n") || "(empty workspace)";
}
