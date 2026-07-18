import { flagStr } from "../args.js";
import { failResponse, printResult } from "../output.js";
import type { CommandCtx } from "./_shared.js";

interface TreeNode {
  id?: string;
  parent_id?: string | null;
  kind?: string;
  title?: string;
  tags?: unknown;
  [k: string]: unknown;
}

/**
 * Compatibility command: `tree` now means semantic parent hierarchy plus
 * reusable tags. It does not expose containers or filesystem placement.
 */
export async function tree(ctx: CommandCtx): Promise<void> {
  const depthRaw = flagStr(ctx.flags, "depth");
  const depth = depthRaw ? parseInt(depthRaw, 10) : undefined;
  if (depthRaw !== undefined && (!Number.isInteger(depth) || depth! < 1)) {
    throw new Error("--depth must be a positive integer");
  }

  const res = await ctx.client.request<{ hierarchy?: TreeNode[]; nodes?: TreeNode[]; tree?: TreeNode[] }>(
    "POST",
    "/api/agents/context",
    { body: { workspace: ctx.workspace, query: "", include_counts: false } },
  );
  if (!res.ok) failResponse(res);

  let nodes = res.data.hierarchy ?? res.data.nodes ?? res.data.tree ?? [];
  if (depth !== undefined && Number.isFinite(depth)) {
    nodes = pruneByDepth(nodes, depth);
  }

  printResult(
    {
      hierarchy: nodes,
      tree: nodes,
      deprecated: "tree is retained as a compatibility command/key; use hierarchy, tags, views, and graph queries",
      semantics: "parent_id is optional hierarchy between real nodes; tags provide reusable classification",
    },
    ctx.mode,
    () => renderSemanticTree(nodes),
  );
}

/** Keeps nodes whose ancestor chain length is < depth. */
export function pruneByDepth(nodes: TreeNode[], depth: number): TreeNode[] {
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
export function renderSemanticTree(nodes: TreeNode[]): string {
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
      const tags = nodeTagNames(n).map((tag) => `#${tag}`).join(" ");
      lines.push(`${"  ".repeat(indent)}[${n.kind ?? "?"}] ${n.title ?? n.id}${tags ? `  ${tags}` : ""}`);
      if (n.id) walk(n.id, indent + 1);
    }
  };
  walk(null, 0);
  return lines.join("\n") || "(empty workspace)";
}

function nodeTagNames(node: TreeNode): string[] {
  const hydrated = Array.isArray(node.tags) ? node.tags.flatMap((tag) => {
    if (typeof tag === "string") return [tag];
    if (!tag || typeof tag !== "object") return [];
    const record = tag as { name?: unknown; normalized_name?: unknown };
    return typeof record.name === "string"
      ? [record.name]
      : typeof record.normalized_name === "string" ? [record.normalized_name] : [];
  }) : [];
  return [...new Set(hydrated.map((tag) => tag.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}
