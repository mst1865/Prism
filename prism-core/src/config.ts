import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { PrismConfig, ResolvedPrismConfig } from "./types.js";

const defaultConfig: PrismConfig = {
  vaultDir: "D:\\TolariaVault",
  watchDirs: [],
};

export function getDefaultAppDataDir(): string {
  return process.env.APPDATA ?? join(process.env.USERPROFILE ?? process.cwd(), "AppData", "Roaming");
}

export function getConfigPath(appDataDir = getDefaultAppDataDir()): string {
  return join(appDataDir, "Prism", "config.json");
}

export async function ensureConfigDir(appDataDir = getDefaultAppDataDir()): Promise<void> {
  await mkdir(dirname(getConfigPath(appDataDir)), { recursive: true });
}

export async function loadConfigFromAppData(appDataDir = getDefaultAppDataDir()): Promise<ResolvedPrismConfig> {
  const configPath = getConfigPath(appDataDir);
  let parsed: Partial<PrismConfig> = {};

  try {
    parsed = JSON.parse(await readFile(configPath, "utf-8")) as Partial<PrismConfig>;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }

  const vaultDir = typeof parsed.vaultDir === "string" && parsed.vaultDir.trim()
    ? parsed.vaultDir.trim()
    : defaultConfig.vaultDir;
  const watchDirs = Array.isArray(parsed.watchDirs)
    ? parsed.watchDirs.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : defaultConfig.watchDirs;

  return resolveConfig({ vaultDir, watchDirs }, appDataDir);
}

export function resolveConfig(config: PrismConfig, appDataDir = getDefaultAppDataDir()): ResolvedPrismConfig {
  const prismDataDir = join(appDataDir, "Prism");
  const vaultDir = config.vaultDir;
  return {
    vaultDir,
    watchDirs: config.watchDirs,
    appDataDir: prismDataDir,
    databasePath: join(prismDataDir, "prism.db"),
    knowledgeDir: resolve(vaultDir, "knowledge"),
    rawDir: resolve(vaultDir, "raw"),
  };
}
