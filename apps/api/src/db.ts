import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  DifficultyLevel,
  InteractionRecord,
  InteractionType,
  ProgressRecord,
  StoreData,
  User,
  UserPreferences,
  VoiceSettings
} from "./types.js";

// The database file lives on the Azure Files share in production (DATA_DIR=/data).
// Azure Files (SMB) cannot host WAL mode, so the default rollback journal is used on purpose.
let db: Database.Database | null = null;

function resolveDbPath(): string {
  const dataDir = path.resolve(process.env.DATA_DIR?.trim() || path.join(process.cwd(), "data"));
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "app.db");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS preferences (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  interaction_mode TEXT NOT NULL,
  voice_settings   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS progress (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id   TEXT NOT NULL,
  level      TEXT NOT NULL,
  status     TEXT NOT NULL,
  score      REAL NOT NULL DEFAULT 0,
  time_spent REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, topic_id, level)
);

CREATE TABLE IF NOT EXISTS history (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id  TEXT NOT NULL,
  type      TEXT NOT NULL,
  input     TEXT NOT NULL,
  output    TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  meta      TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_history_user_topic ON history(user_id, topic_id, timestamp);

CREATE TABLE IF NOT EXISTS tts_cache (
  cache_key  TEXT PRIMARY KEY,
  audio      BLOB NOT NULL,
  chars      INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tts_created ON tts_cache(created_at);

CREATE TABLE IF NOT EXISTS simulation_cache (
  cache_key  TEXT PRIMARY KEY,
  payload    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

export function initDb(): Database.Database {
  if (db) {
    return db;
  }
  const dbPath = resolveDbPath();
  const instance = new Database(dbPath);
  instance.pragma("journal_mode = DELETE");
  instance.pragma("foreign_keys = ON");
  instance.pragma("busy_timeout = 5000");
  instance.exec(SCHEMA);
  db = instance;
  console.log(`[DB] SQLite ready at ${dbPath}`);
  return instance;
}

function getDb(): Database.Database {
  return db ?? initDb();
}

export function closeDb(): void {
  db?.close();
  db = null;
}

export function inTransaction<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || raw.length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (_error) {
    return fallback;
  }
}

// ---------- users ----------

type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
  last_login_at: string;
};

function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at
  };
}

export function findUserByEmail(email: string): User | null {
  const row = getDb().prepare("SELECT * FROM users WHERE email = ?").get(email.trim()) as UserRow | undefined;
  return row ? toUser(row) : null;
}

/** Returns false when the email is already registered (unique constraint). */
export function createUser(user: User): boolean {
  try {
    getDb()
      .prepare(
        "INSERT INTO users (id, name, email, password_hash, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(user.id, user.name, user.email, user.passwordHash, user.createdAt, user.lastLoginAt);
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      return false;
    }
    throw error;
  }
}

export function touchLastLogin(userId: string, at: string): void {
  getDb().prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(at, userId);
}

// ---------- sessions ----------

export function createSession(tokenHash: string, userId: string, createdAt: Date, expiresAt: Date): void {
  getDb()
    .prepare("INSERT OR REPLACE INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(tokenHash, userId, createdAt.toISOString(), expiresAt.toISOString());
}

export function findSession(tokenHash: string): { userId: string; expiresAt: string } | null {
  const row = getDb()
    .prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?")
    .get(tokenHash) as { user_id: string; expires_at: string } | undefined;
  return row ? { userId: row.user_id, expiresAt: row.expires_at } : null;
}

export function deleteExpiredSessions(now: Date = new Date()): number {
  return getDb().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now.toISOString()).changes;
}

// ---------- preferences ----------

type PreferencesRow = { user_id: string; interaction_mode: string; voice_settings: string };

export function getPreferences(userId: string): UserPreferences | null {
  const row = getDb().prepare("SELECT * FROM preferences WHERE user_id = ?").get(userId) as
    | PreferencesRow
    | undefined;
  if (!row) {
    return null;
  }
  return {
    userId: row.user_id,
    interactionMode: row.interaction_mode as UserPreferences["interactionMode"],
    voiceSettings: parseJson<VoiceSettings>(row.voice_settings, {} as VoiceSettings)
  };
}

export function upsertPreferences(preferences: UserPreferences): void {
  getDb()
    .prepare(
      `INSERT INTO preferences (user_id, interaction_mode, voice_settings) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET interaction_mode = excluded.interaction_mode,
                                          voice_settings   = excluded.voice_settings`
    )
    .run(preferences.userId, preferences.interactionMode, JSON.stringify(preferences.voiceSettings));
}

export function ensurePreferences(preferences: UserPreferences): void {
  getDb()
    .prepare("INSERT OR IGNORE INTO preferences (user_id, interaction_mode, voice_settings) VALUES (?, ?, ?)")
    .run(preferences.userId, preferences.interactionMode, JSON.stringify(preferences.voiceSettings));
}

// ---------- progress ----------

type ProgressRow = {
  user_id: string;
  topic_id: string;
  level: string;
  status: string;
  score: number;
  time_spent: number;
  updated_at: string;
};

function toProgress(row: ProgressRow): ProgressRecord {
  return {
    userId: row.user_id,
    topicId: row.topic_id,
    level: row.level as DifficultyLevel,
    status: row.status as ProgressRecord["status"],
    score: row.score,
    timeSpent: row.time_spent,
    updatedAt: row.updated_at
  };
}

export function listProgress(userId: string): ProgressRecord[] {
  const rows = getDb()
    .prepare("SELECT * FROM progress WHERE user_id = ? ORDER BY topic_id, level")
    .all(userId) as ProgressRow[];
  return rows.map(toProgress);
}

export function upsertProgress(record: ProgressRecord): void {
  getDb()
    .prepare(
      `INSERT INTO progress (user_id, topic_id, level, status, score, time_spent, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, topic_id, level) DO UPDATE SET
         status = excluded.status, score = excluded.score,
         time_spent = excluded.time_spent, updated_at = excluded.updated_at`
    )
    .run(record.userId, record.topicId, record.level, record.status, record.score, record.timeSpent, record.updatedAt);
}

/** Inserts the record only when no row exists for (user, topic, level). */
export function insertProgressIfMissing(record: ProgressRecord): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO progress (user_id, topic_id, level, status, score, time_spent, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(record.userId, record.topicId, record.level, record.status, record.score, record.timeSpent, record.updatedAt);
}

// ---------- history ----------

type HistoryRow = {
  id: string;
  user_id: string;
  topic_id: string;
  type: string;
  input: string;
  output: string;
  timestamp: string;
  meta: string;
};

function toHistory(row: HistoryRow): InteractionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    topicId: row.topic_id,
    type: row.type as InteractionType,
    input: row.input,
    output: row.output,
    timestamp: row.timestamp,
    meta: parseJson<Record<string, unknown>>(row.meta, {})
  };
}

/** Returns false when the owning user no longer exists (foreign key violation). */
export function addHistory(interaction: InteractionRecord): boolean {
  try {
    getDb()
      .prepare(
        "INSERT INTO history (id, user_id, topic_id, type, input, output, timestamp, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        interaction.id,
        interaction.userId,
        interaction.topicId,
        interaction.type,
        interaction.input,
        interaction.output,
        interaction.timestamp,
        JSON.stringify(interaction.meta ?? {})
      );
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return false;
    }
    throw error;
  }
}

export function listHistory(userId: string, topicId?: string): InteractionRecord[] {
  const rows = (
    topicId
      ? getDb()
          .prepare("SELECT * FROM history WHERE user_id = ? AND topic_id = ? ORDER BY timestamp ASC, rowid ASC")
          .all(userId, topicId)
      : getDb().prepare("SELECT * FROM history WHERE user_id = ? ORDER BY timestamp ASC, rowid ASC").all(userId)
  ) as HistoryRow[];
  return rows.map(toHistory);
}

export function deleteHistoryByTopic(userId: string, topicId: string): number {
  return getDb().prepare("DELETE FROM history WHERE user_id = ? AND topic_id = ?").run(userId, topicId).changes;
}

// ---------- simulation cache ----------

export function getCachedSimulation<T>(cacheKey: string, maxAgeMs: number): T | null {
  const row = getDb()
    .prepare("SELECT payload, created_at FROM simulation_cache WHERE cache_key = ?")
    .get(cacheKey) as { payload: string; created_at: number } | undefined;
  if (!row || Date.now() - row.created_at > maxAgeMs) {
    return null;
  }
  return parseJson<T | null>(row.payload, null);
}

export function putCachedSimulation(cacheKey: string, payload: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO simulation_cache (cache_key, payload, created_at) VALUES (?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at`
    )
    .run(cacheKey, JSON.stringify(payload), Date.now());
}

export function pruneSimulationCache(maxAgeMs: number): number {
  return getDb().prepare("DELETE FROM simulation_cache WHERE created_at < ?").run(Date.now() - maxAgeMs).changes;
}

// ---------- backup / restore ----------

export function exportStore(): StoreData {
  const database = getDb();
  const users = (database.prepare("SELECT * FROM users ORDER BY created_at").all() as UserRow[]).map(toUser);
  const preferences = (database.prepare("SELECT * FROM preferences").all() as PreferencesRow[]).map((row) => ({
    userId: row.user_id,
    interactionMode: row.interaction_mode as UserPreferences["interactionMode"],
    voiceSettings: parseJson<VoiceSettings>(row.voice_settings, {} as VoiceSettings)
  }));
  const progress = (database.prepare("SELECT * FROM progress").all() as ProgressRow[]).map(toProgress);
  const history = (database.prepare("SELECT * FROM history ORDER BY timestamp, rowid").all() as HistoryRow[]).map(
    toHistory
  );
  return { users, preferences, progress, history };
}

/** Replaces users, preferences, progress and history with the snapshot. Sessions and cache are cleared. */
export function importStore(store: StoreData): void {
  const database = getDb();
  const insertUser = database.prepare(
    "INSERT INTO users (id, name, email, password_hash, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertPreferences = database.prepare(
    "INSERT INTO preferences (user_id, interaction_mode, voice_settings) VALUES (?, ?, ?)"
  );
  const insertProgress = database.prepare(
    "INSERT INTO progress (user_id, topic_id, level, status, score, time_spent, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const insertHistory = database.prepare(
    "INSERT INTO history (id, user_id, topic_id, type, input, output, timestamp, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  database.transaction(() => {
    database.exec("DELETE FROM history; DELETE FROM progress; DELETE FROM preferences; DELETE FROM sessions; DELETE FROM users; DELETE FROM simulation_cache;");
    for (const user of store.users) {
      insertUser.run(user.id, user.name ?? "", user.email, user.passwordHash, user.createdAt, user.lastLoginAt ?? user.createdAt);
    }
    for (const item of store.preferences) {
      insertPreferences.run(item.userId, item.interactionMode, JSON.stringify(item.voiceSettings));
    }
    for (const item of store.progress) {
      insertProgress.run(item.userId, item.topicId, item.level, item.status, item.score, item.timeSpent, item.updatedAt);
    }
    for (const item of store.history) {
      insertHistory.run(
        item.id,
        item.userId,
        item.topicId,
        item.type,
        item.input,
        item.output,
        item.timestamp,
        JSON.stringify(item.meta ?? {})
      );
    }
  })();
}

// ---------- text-to-speech cache ----------

export function getCachedSpeech(cacheKey: string): Buffer | null {
  const row = getDb().prepare("SELECT audio FROM tts_cache WHERE cache_key = ?").get(cacheKey) as
    | { audio: Buffer }
    | undefined;
  return row ? row.audio : null;
}

export function putCachedSpeech(cacheKey: string, audio: Buffer, chars: number): void {
  getDb()
    .prepare("INSERT OR REPLACE INTO tts_cache (cache_key, audio, chars, created_at) VALUES (?, ?, ?, ?)")
    .run(cacheKey, audio, chars, Date.now());
}

/** Characters actually sent to the TTS provider since the given time (cache hits cost nothing). */
export function speechCharsSince(sinceMs: number): number {
  const row = getDb().prepare("SELECT COALESCE(SUM(chars), 0) AS total FROM tts_cache WHERE created_at >= ?").get(sinceMs) as {
    total: number;
  };
  return row.total;
}
