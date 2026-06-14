import { fileURLToPath } from "node:url";
import path from "node:path";

// Works both as ESM (dev via tsx) and as a bundled CJS file (deploy), where import.meta.url is
// empty and fileURLToPath() would throw — fall back to the process working directory.
function resolveRepoRoot(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(here, "..", "..", "..");
  } catch {
    return process.cwd();
  }
}
const repoRoot = resolveRepoRoot();

function int(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: int("PORT", 8080),
  host: process.env.HOST ?? "0.0.0.0",
  apiKey: process.env.AEROPDF_API_KEY ?? "local-dev-key",
  storageDriver: (process.env.STORAGE_DRIVER ?? "local") as "local" | "s3",
  // STORAGE_PATH wins; otherwise a repo-local data dir (resolved against cwd in bundled deploys).
  storagePath: process.env.STORAGE_PATH
    ? path.resolve(process.env.STORAGE_PATH)
    : path.join(repoRoot, "aeropdf-data"),
  maxUploadMb: int("MAX_UPLOAD_MB", 50),
  renderTimeoutMs: int("RENDER_TIMEOUT_MS", 60000),
  // DASHBOARD_DIR lets a bundled/deploy build point at its copied static assets.
  dashboardDir: process.env.DASHBOARD_DIR
    ? path.resolve(process.env.DASHBOARD_DIR)
    : path.join(repoRoot, "apps", "dashboard"),
  version: "0.1.0",
} as const;
