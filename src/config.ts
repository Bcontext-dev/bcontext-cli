/**
 * Config resolution for the Bcontext CLI.
 *
 * Precedence (highest first):
 *   1. explicit flags (--url / --token / --workspace)
 *   2. environment (BCONTEXT_URL / BCONTEXT_TOKEN / BCONTEXT_WORKSPACE)
 *   3. ~/.config/bcontext/config.json  (honours $XDG_CONFIG_HOME)
 *   4. built-in defaults
 *
 * The token never leaves disk except as a Bearer header. The config file is
 * written 0600 so other users on the box can't read the PAT.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const DEFAULT_URL = "https://bcontext.es";

/** Persisted shape of ~/.config/bcontext/config.json. */
export interface FileConfig {
  url?: string;
  token?: string;
  workspace?: string;
}

/** Flags that can override file/env config on any invocation. */
export interface ConfigFlags {
  url?: string;
  token?: string;
  workspace?: string;
}

/** Fully resolved config handed to the HTTP client. */
export interface ResolvedConfig {
  url: string;
  token?: string;
  workspace?: string;
}

function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() ? xdg : join(homedir(), ".config");
  return join(base, "bcontext");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

/** Reads the on-disk config, returning {} when missing or unparseable. */
export function loadFileConfig(): FileConfig {
  let raw: string;
  try {
    raw = readFileSync(configPath(), "utf8");
  } catch {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as FileConfig;
    return {};
  } catch {
    return {};
  }
}

/** Merges `patch` into the on-disk config and writes it back 0600. */
export function saveFileConfig(patch: FileConfig): FileConfig {
  const next: FileConfig = { ...loadFileConfig(), ...patch };
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  writeFileSync(configPath(), JSON.stringify(next, null, 2) + "\n", {
    mode: 0o600,
  });
  return next;
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Collapses flags > env > file > default into a single config. Empty
 * strings are treated as unset so `BCONTEXT_TOKEN=` doesn't shadow the file.
 */
export function resolveConfig(flags: ConfigFlags = {}): ResolvedConfig {
  const file = loadFileConfig();
  const env = {
    url: pick(process.env.BCONTEXT_URL),
    token: pick(process.env.BCONTEXT_TOKEN),
    workspace: pick(process.env.BCONTEXT_WORKSPACE),
  };

  const url =
    pick(flags.url) ?? env.url ?? pick(file.url) ?? DEFAULT_URL;
  const token = pick(flags.token) ?? env.token ?? pick(file.token);
  const workspace =
    pick(flags.workspace) ?? env.workspace ?? pick(file.workspace);

  return { url: normalizeUrl(url), token, workspace };
}

/** undefined for unset/empty/whitespace-only values. */
function pick(v: string | undefined): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}
