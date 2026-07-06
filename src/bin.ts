#!/usr/bin/env node
/**
 * `bcontext` / `bx` — CLI entrypoint.
 *
 * P11-01 ships the skeleton: auth (login / use / whoami / logout), config
 * resolution, and the shared HTTP client. The read/write commands
 * (search / get / tree / ask / create / update / link / skill) land in
 * P11-02 and are stubbed here so the surface is discoverable.
 */
import { parseArgv, flagStr, flagBool } from "./args.js";
import {
  resolveConfig,
  saveFileConfig,
  configPath,
  type ConfigFlags,
} from "./config.js";
import { BcontextClient, AuthError } from "./client.js";
import { fail, printResult, type OutputMode } from "./output.js";
import { isCommand, runCommand } from "./router.js";

const VERSION = "0.1.0";

async function main(): Promise<void> {
  const { positionals, flags } = parseArgv(process.argv.slice(2));

  if (flagBool(flags, "version")) {
    process.stdout.write(VERSION + "\n");
    return;
  }

  const command = positionals[0];
  // `--help` anywhere prints help — `bx create --help` must never EXECUTE
  // create (surprising and, for write commands, dangerous).
  if (!command || flagBool(flags, "help")) {
    printHelp();
    return;
  }

  const mode: OutputMode = { pretty: flagBool(flags, "pretty") };
  const configFlags: ConfigFlags = {
    url: flagStr(flags, "url"),
    token: flagStr(flags, "token"),
    workspace: flagStr(flags, "workspace"),
  };

  switch (command) {
    case "login":
      await cmdLogin(configFlags, mode);
      return;
    case "use":
      await cmdUse(positionals[1], configFlags, mode);
      return;
    case "whoami":
      cmdWhoami(configFlags, mode);
      return;
    case "logout":
      cmdLogout(mode);
      return;
    case "help":
      printHelp();
      return;
    default:
      if (isCommand(command)) {
        await runCommand(command, positionals, flags, mode);
        return;
      }
      fail(`unknown command "${command}". Run \`bcontext help\`.`, 2);
  }
}

async function cmdLogin(
  configFlags: ConfigFlags,
  mode: OutputMode,
): Promise<void> {
  // Token may come from --token or BCONTEXT_TOKEN; we don't read it from the
  // file here (login is what *writes* the file).
  const token = configFlags.token ?? envToken();
  if (!token) {
    fail(
      "login requires a token. Usage: `bcontext login --token <pat>` " +
        "(or set BCONTEXT_TOKEN).",
      2,
    );
  }
  const resolved = resolveConfig({ ...configFlags, token });
  const workspace = configFlags.workspace ?? resolved.workspace;
  const client = new BcontextClient({ ...resolved, token });

  // Verify against the live API when a workspace is known — the agents/context
  // route needs a workspace, so a token-only login can't be verified yet.
  let verifiedWorkspace: string | undefined;
  if (workspace) {
    try {
      const v = await client.verify(workspace);
      verifiedWorkspace = v.workspace;
    } catch (err) {
      if (err instanceof AuthError) {
        fail(
          `login failed (HTTP ${err.status}): ${err.message}`,
          err.status === 401 || err.status === 403 ? 3 : 1,
        );
      }
      throw err;
    }
  }

  saveFileConfig({
    token,
    url: configFlags.url ?? undefined,
    workspace: verifiedWorkspace ?? workspace ?? undefined,
  });

  printResult(
    {
      ok: true,
      url: resolved.url,
      workspace: verifiedWorkspace ?? workspace ?? null,
      verified: Boolean(verifiedWorkspace),
      token: maskToken(token),
      config: configPath(),
      note: workspace
        ? undefined
        : "no workspace set — run `bcontext use <slug>` to verify the token and pick a default workspace.",
    },
    mode,
    (d) => {
      const o = d as Record<string, unknown>;
      const ws = o.workspace ?? "(none — run: bcontext use <slug>)";
      const lines = [
        `Logged in to ${o.url}`,
        `  workspace: ${ws}`,
        `  token:     ${o.token}`,
        `  config:    ${o.config}`,
      ];
      return lines.join("\n");
    },
  );
}

async function cmdUse(
  slug: string | undefined,
  configFlags: ConfigFlags,
  mode: OutputMode,
): Promise<void> {
  if (!slug) {
    fail("usage: `bcontext use <workspace-slug>`", 2);
  }
  const resolved = resolveConfig(configFlags);
  if (!resolved.token) {
    fail(
      "no token configured. Run `bcontext login --token <pat>` first.",
      3,
    );
  }
  const client = new BcontextClient(resolved);
  try {
    const v = await client.verify(slug);
    saveFileConfig({ workspace: v.workspace });
    printResult(
      { ok: true, workspace: v.workspace, url: resolved.url },
      mode,
      (d) => `Active workspace set to ${(d as { workspace: string }).workspace}`,
    );
  } catch (err) {
    if (err instanceof AuthError) {
      fail(
        `cannot use "${slug}" (HTTP ${err.status}): ${err.message}`,
        err.status === 401 || err.status === 403 ? 3 : 1,
      );
    }
    throw err;
  }
}

function cmdWhoami(configFlags: ConfigFlags, mode: OutputMode): void {
  const resolved = resolveConfig(configFlags);
  printResult(
    {
      url: resolved.url,
      workspace: resolved.workspace ?? null,
      token: resolved.token ? maskToken(resolved.token) : null,
      authenticated: Boolean(resolved.token),
      config: configPath(),
    },
    mode,
    (d) => {
      const o = d as Record<string, unknown>;
      return [
        `url:       ${o.url}`,
        `workspace: ${o.workspace ?? "(none)"}`,
        `token:     ${o.token ?? "(none)"}`,
        `config:    ${o.config}`,
      ].join("\n");
    },
  );
}

function cmdLogout(mode: OutputMode): void {
  // Passing undefined drops the keys on the next JSON.stringify.
  saveFileConfig({ token: undefined, workspace: undefined });
  printResult(
    { ok: true, message: "cleared token and workspace from config.", config: configPath() },
    mode,
    () => "Logged out (token + workspace cleared).",
  );
}

function envToken(): string | undefined {
  const t = process.env.BCONTEXT_TOKEN;
  return t && t.trim() ? t.trim() : undefined;
}

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

function printHelp(): void {
  process.stdout.write(
    `bcontext ${VERSION} — Bcontext CLI (agent surface over your workspace)

Usage:
  bcontext <command> [options]

Auth commands:
  login --token <pat> [--workspace <slug>]   Store + verify a workspace PAT
  use <workspace-slug>                        Set + verify the default workspace
  whoami                                      Show resolved url / workspace / token
  logout                                      Clear stored token + workspace

Read commands:
  search <query> [--k 5] [--kind doc,adr]     Search — one hit per node, block refs nested
  get <id> [--block <slug>] [--md]            Fetch a node + links, dependencies, attachments
  tree [--depth N]                            List the workspace node tree
  ask <question>                              Ask the workspace agent (streamed + sources)
  changes [--since <iso>] [--limit 50]        Recent changes (incremental sync)
  unblocked [--kind task] [--status todo]     Tasks ready to start (no undone blockers)

Write commands:
  create --kind <k> --title <t> [--parent <id>] [--md -]
  update <id> [--title ..] [--md -] [--status ..] [--if-updated-at <ts>]
  link <from-id> <to-id> [--relation blocked_by|references|caused_by|relates_to]
  unlink <from-id> <to-id> [--relation <r>]
  toggle <node-id> <index> [--block <slug>] [--on|--off]
  attach <node-id> <file.png> [--type image/png]
  skill run <id> [--input '<json>'] [--model <m>]

Escape hatch:
  mcp <tool> ['<json-args>']                  Call any MCP tool directly

Read from stdin with '--md -'  (e.g.  echo "# Hi" | bcontext create --kind doc --title Hi --md -).

Global options:
  --url <url>           API base URL (default https://bcontext.es)
  --token <pat>         Bearer token override
  --workspace <slug>    Workspace override for this call (alias -w)
  --json                JSON output (default)
  --pretty              Human-readable output
  --help, -h            Show this help
  --version, -v         Print version

Config precedence: flags > env (BCONTEXT_URL/TOKEN/WORKSPACE) > ${configPath()} > defaults
`,
  );
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err), 1);
});
