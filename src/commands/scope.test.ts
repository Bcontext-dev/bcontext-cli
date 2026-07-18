import { describe, expect, it } from "vitest";
import { buildRagScope } from "./scope.js";

describe("buildRagScope", () => {
  it("omits scope so MCP keeps workspace as default", () => {
    expect(buildRagScope({})).toBeUndefined();
  });

  it("builds deterministic tag and neighborhood scopes", () => {
    expect(buildRagScope({ "tags-any": "tech,product,tech", broad: true })).toEqual({
      schema_version: 1,
      type: "tags",
      tags_any: ["product", "tech"],
      tags_all: [],
      graph_expansion: "broad",
    });
    expect(buildRagScope({ near: "b,a", depth: "9" })).toEqual({
      schema_version: 1,
      type: "neighborhood",
      root_node_ids: ["a", "b"],
      depth: 3,
      graph_expansion: "strict",
    });
  });

  it("keeps the global lane explicit through auto and accepts mixed hints", () => {
    expect(buildRagScope({ scope: "auto", view: "v1", select: "n1", "tags-all": "product" })).toEqual({
      schema_version: 1,
      type: "auto",
      view_id: "v1",
      tags_any: [],
      tags_all: ["product"],
      node_ids: ["n1"],
      graph_expansion: "strict",
    });
  });

  it("rejects incompatible explicit hints", () => {
    expect(() => buildRagScope({ view: "v1", select: "n1" })).toThrow(/mutually exclusive/);
  });
});
