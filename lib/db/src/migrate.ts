import { getPool, isDbReady } from "./index";

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS rule_groups (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  phone_number TEXT,
  messages_sent INTEGER NOT NULL DEFAULT 0,
  messages_received INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  current_device_id TEXT,
  current_device_info TEXT,
  last_used_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'contains',
  match_value TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'reply',
  reply_text TEXT,
  webhook_url TEXT,
  webhook_method TEXT DEFAULT 'POST',
  forward_to TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  session_filter TEXT,
  group_reply_mode BOOLEAN NOT NULL DEFAULT false,
  group_id INTEGER REFERENCES rule_groups(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  session_id TEXT NOT NULL,
  "from" TEXT NOT NULL,
  push_name TEXT,
  text TEXT NOT NULL,
  matched_rule_id INTEGER,
  action_taken TEXT,
  replied_by_session TEXT,
  replied_at TIMESTAMP,
  is_processed BOOLEAN NOT NULL DEFAULT false,
  lock_token TEXT,
  lock_expires_at TIMESTAMP,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_reply_sessions (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  chat_jid TEXT NOT NULL,
  rule_group_id INTEGER NOT NULL,
  bot_message_id TEXT NOT NULL,
  bot_message_key JSONB NOT NULL,
  wa_session_id TEXT NOT NULL,
  reply_count INTEGER NOT NULL DEFAULT 1,
  last_content TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Kolom upgrade (aman dijalankan berulang kali)
DO $$
BEGIN
  -- Sessions: kolom lama
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS phone_number TEXT;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS messages_sent INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS messages_received INTEGER NOT NULL DEFAULT 0;

  -- Sessions: kolom device lock baru
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_device_id TEXT;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_device_info TEXT;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP;

  -- Messages
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS replied_by_session TEXT;
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS replied_at TIMESTAMP;
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_processed BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS lock_token TEXT;
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS lock_expires_at TIMESTAMP;
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS push_name TEXT;

  -- Rules
  ALTER TABLE rules ADD COLUMN IF NOT EXISTS session_filter TEXT;
  ALTER TABLE rules ADD COLUMN IF NOT EXISTS webhook_method TEXT DEFAULT 'POST';
  ALTER TABLE rules ADD COLUMN IF NOT EXISTS group_reply_mode BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE rules ADD COLUMN IF NOT EXISTS group_id INTEGER;
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

-- Upgrade group_reply_sessions jika masih pakai skema lama
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_reply_sessions' AND column_name = 'rule_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_reply_sessions' AND column_name = 'chat_jid'
  ) THEN
    DROP TABLE group_reply_sessions;
    CREATE TABLE group_reply_sessions (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      chat_jid TEXT NOT NULL,
      rule_group_id INTEGER NOT NULL,
      bot_message_id TEXT NOT NULL,
      bot_message_key JSONB NOT NULL,
      wa_session_id TEXT NOT NULL,
      reply_count INTEGER NOT NULL DEFAULT 1,
      last_content TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_is_processed ON messages(is_processed);
CREATE INDEX IF NOT EXISTS idx_messages_lock ON messages(lock_token) WHERE lock_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grp_reply_chat_group ON group_reply_sessions(chat_jid, rule_group_id);
CREATE INDEX IF NOT EXISTS idx_grp_reply_expires ON group_reply_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_device ON sessions(current_device_id) WHERE current_device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_last_used ON sessions(last_used_at);
`;

export async function runMigrations(): Promise<{ ok: boolean; message: string }> {
  if (!isDbReady()) {
    return { ok: false, message: "Database belum dikonfigurasi" };
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query(MIGRATION_SQL);
      return { ok: true, message: "Migrasi berhasil" };
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
