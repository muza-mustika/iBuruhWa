import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import fs from "fs";
import path from "path";
import * as schema from "./schema";

const { Pool } = pg;

export type DbSchema = typeof schema;

const CONFIG_PATH = path.resolve(
  process.cwd(),
  process.cwd().includes("artifacts/api-server") ? "../.." : ".",
  "artifacts/api-server/.config.local.json"
);

function readConfigUrl(): string | undefined {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      return JSON.parse(raw)?.databaseUrl || undefined;
    }
  } catch {
    // ignore
  }
  return undefined;
}

export function saveConfigUrl(url: string): void {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    let cfg: Record<string, unknown> = {};
    try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")); } catch {}
    cfg.databaseUrl = url;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch (err) {
    throw new Error(`Gagal menyimpan konfigurasi database: ${err}`);
  }
}

let _pool: pg.Pool | null = null;
let _db: NodePgDatabase<DbSchema> | null = null;

export function isDbReady(): boolean {
  return _pool !== null;
}

export function getDbUrl(): string | undefined {
  return (
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    readConfigUrl()
  );
}

export function initDb(url: string): void {
  if (_pool) {
    _pool.end().catch(() => {});
  }
  const isSupabase = url.includes("supabase");
  _pool = new Pool({
    connectionString: url,
    ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
  });
  _db = drizzle(_pool, { schema });
}

export function getPool(): pg.Pool {
  if (!_pool) throw new Error("Database belum dikonfigurasi. Buka halaman Pengaturan > Database untuk mengatur koneksi.");
  return _pool;
}

export function getDb(): NodePgDatabase<DbSchema> {
  if (!_db) throw new Error("Database belum dikonfigurasi. Buka halaman Pengaturan > Database untuk mengatur koneksi.");
  return _db;
}

export async function testConnection(url: string): Promise<{ ok: boolean; message: string }> {
  try {
    const isSupabase = url.includes("supabase");
    const testPool = new Pool({
      connectionString: url,
      ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 8000,
      max: 1,
    });
    const client = await testPool.connect();
    await client.query("SELECT 1");
    client.release();
    await testPool.end();
    return { ok: true, message: "Koneksi berhasil" };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

const autoUrl = getDbUrl();
if (autoUrl) {
  try {
    initDb(autoUrl);
  } catch {
    // Defer — user will configure via web
  }
}

export * from "./schema";
