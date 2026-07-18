import { afterEach, describe, expect, it, vi } from "vitest";
import type { BcontextClient } from "../client.js";
import type { CommandCtx } from "./_shared.js";
import { CREATABLE_KINDS, create } from "./create.js";
import { renderSemanticTree, tree } from "./tree.js";
import { update } from "./update.js";

function context(flags: Record<string, string | boolean>, client: Partial<BcontextClient>): CommandCtx {
  return {
    client: client as BcontextClient,
    workspace: "workspace",
    args: [],
    flags,
    mode: { pretty: false },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("folderless CLI contract", () => {
  it("creates only real node kinds with tags and optional semantic hierarchy", async () => {
    expect(CREATABLE_KINDS).not.toContain("folder");
    const mcpCall = vi.fn().mockResolvedValue({ node: { id: "n1", kind: "doc", title: "Part" } });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await create(context({
      kind: "doc",
      title: "Part",
      parent: "document-id",
      "tag-ids": "tech-id, product-id,tech-id",
    }, { mcpCall }));

    expect(mcpCall).toHaveBeenCalledWith("create_node", {
      title: "Part",
      kind: "doc",
      parent_id: "document-id",
      tag_ids: ["product-id", "tech-id"],
    }, "workspace");
  });

  it("updates complete tag assignments and can clear semantic hierarchy", async () => {
    const mcpCall = vi.fn().mockResolvedValue({ node: { id: "n1" } });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const ctx = context({ "tag-ids": "", parent: "root" }, { mcpCall });
    ctx.args = ["n1"];

    await update(ctx);

    expect(mcpCall).toHaveBeenCalledWith("update_node", {
      id: "n1",
      patch: { parent_id: null, tag_ids: [] },
    }, "workspace");
  });

  it("rejects legacy folder and category writes with a self-correcting error", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(create(context({ kind: "folder", title: "Container" }, {}))).rejects.toThrow("exit:2");
    await expect(create(context({ kind: "doc", title: "Doc", category: "tech" }, {}))).rejects.toThrow("exit:2");
  });

  it("renders tags next to nodes while indentation reflects only semantic parents", () => {
    expect(renderSemanticTree([
      { id: "epic", parent_id: null, kind: "task", title: "Epic", tags: [{ name: "Product" }] },
      { id: "part", parent_id: "epic", kind: "doc", title: "Part", tags: [{ normalized_name: "Tech" }, { name: "Product" }] },
    ])).toBe("[task] Epic  #Product\n  [doc] Part  #Product #Tech");
  });

  it("keeps tree only as a deprecated compatibility key around canonical hierarchy", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      data: { hierarchy: [{ id: "n1", parent_id: null, kind: "doc", title: "Doc", tags: [] }] },
    });
    let stdout = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });

    await tree(context({}, { request }));

    expect(JSON.parse(stdout)).toMatchObject({
      hierarchy: [{ id: "n1" }],
      tree: [{ id: "n1" }],
      deprecated: expect.stringContaining("compatibility"),
    });
  });
});
