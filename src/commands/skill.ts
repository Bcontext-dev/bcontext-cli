import { flagStr } from "../args.js";
import { fail, failResponse, printResult } from "../output.js";
import { type CommandCtx } from "./_shared.js";

/**
 * `bcontext skill run <id> [--input '<json>'] [--model <m>]`
 * → POST /api/skills/:id/run
 */
export async function skill(ctx: CommandCtx): Promise<void> {
  // Accept both `skill run <id>` and `skill <id>`.
  const [first, second] = ctx.args;
  const id = first === "run" ? second : first;
  if (!id) {
    fail("usage: bcontext skill run <skill-id> [--input '<json>']", 2);
  }

  let input: unknown = {};
  const raw = flagStr(ctx.flags, "input");
  if (raw) {
    try {
      input = JSON.parse(raw);
    } catch {
      fail("--input must be valid JSON", 2);
    }
  }

  const model = flagStr(ctx.flags, "model");
  const reqBody: Record<string, unknown> = { workspace: ctx.workspace, input };
  if (model) reqBody.model = model;

  const res = await ctx.client.request(
    "POST",
    `/api/skills/${encodeURIComponent(id!)}/run`,
    { body: reqBody },
  );
  if (!res.ok) failResponse(res);

  printResult(res.data, ctx.mode, (d) => {
    const o = d as Record<string, unknown>;
    return typeof o.output === "string" ? o.output : JSON.stringify(o, null, 2);
  });
}
