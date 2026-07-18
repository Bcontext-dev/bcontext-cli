import { flagBool, flagStr } from "../args.js";

export interface CliRagScope {
  schema_version: 1;
  type: "workspace" | "view" | "tags" | "selection" | "neighborhood" | "auto";
  [key: string]: unknown;
}

/** Build the shared MCP/REST v1 RAG scope from CLI flags. */
export function buildRagScope(flags: Record<string, string | boolean>): CliRagScope | undefined {
  const requested = flagStr(flags, "scope")?.toLowerCase();
  const viewId = flagStr(flags, "view");
  const tagsAny = csv(flagStr(flags, "tags-any"));
  const tagsAll = csv(flagStr(flags, "tags-all"));
  const nodeIds = csv(flagStr(flags, "select"));
  const roots = csv(flagStr(flags, "near"));
  const inferred = [viewId ? "view" : null, tagsAny.length + tagsAll.length > 0 ? "tags" : null, nodeIds.length > 0 ? "selection" : null, roots.length > 0 ? "neighborhood" : null].filter(Boolean) as string[];
  const type = requested ?? (flagBool(flags, "auto") ? "auto" : inferred[0]);
  if (!type) return undefined; // server keeps workspace as the default
  if (!["workspace", "view", "tags", "selection", "neighborhood", "auto"].includes(type)) {
    throw new Error(`invalid --scope ${type}`);
  }
  if (type !== "auto" && inferred.length > 1) {
    throw new Error("view, tags, selection and neighborhood flags are mutually exclusive unless --scope auto is used");
  }
  const graph_expansion = flagBool(flags, "broad") ? "broad" : type === "workspace" ? "broad" : "strict";
  if (type === "workspace") return { schema_version: 1, type, graph_expansion };
  if (type === "view") {
    if (!viewId) throw new Error("--scope view requires --view <id>");
    return { schema_version: 1, type, view_id: viewId, graph_expansion };
  }
  if (type === "tags") {
    if (tagsAny.length + tagsAll.length === 0) throw new Error("--scope tags requires --tags-any or --tags-all");
    return { schema_version: 1, type, tags_any: tagsAny, tags_all: tagsAll, graph_expansion };
  }
  if (type === "selection") {
    if (nodeIds.length === 0) throw new Error("--scope selection requires --select <id,…>");
    return { schema_version: 1, type, node_ids: nodeIds, graph_expansion };
  }
  const depth = boundedInt(flagStr(flags, "depth"), 1, 3, 1);
  if (type === "neighborhood") {
    if (roots.length === 0) throw new Error("--scope neighborhood requires --near <id,…>");
    return { schema_version: 1, type, root_node_ids: roots, depth, graph_expansion };
  }
  return {
    schema_version: 1,
    type: "auto",
    ...(viewId ? { view_id: viewId } : {}),
    tags_any: tagsAny,
    tags_all: tagsAll,
    node_ids: nodeIds,
    ...(roots.length > 0 ? { neighborhood: { root_node_ids: roots, depth } } : {}),
    graph_expansion,
  };
}

function csv(value: string | undefined): string[] {
  return [...new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean))].sort();
}

function boundedInt(value: string | undefined, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
