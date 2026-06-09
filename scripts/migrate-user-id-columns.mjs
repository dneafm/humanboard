import path from 'path';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const dbPath = path.resolve(process.env.HUMANBOARD_DB_PATH || path.join(root, 'data', 'humanboard.sqlite3'));

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath);

function run(sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function all(sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

async function tableExists(tableName) {
  const safeName = tableName.replace(/'/g, "''");
  const rows = await all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${safeName}'`);
  return rows.length > 0;
}

async function columnExists(tableName, columnName) {
  const rows = await all(`PRAGMA table_info(${tableName})`);
  return rows.some((row) => row.name === columnName);
}

async function addUserIdColumnIfMissing(tableName) {
  if (!(await tableExists(tableName))) {
    console.log(`[humanboard:migrate] skipped missing table ${tableName}`);
    return;
  }

  if (!(await columnExists(tableName, 'user_id'))) {
    await run(`ALTER TABLE ${tableName} ADD COLUMN user_id TEXT`);
    console.log(`[humanboard:migrate] added ${tableName}.user_id`);
  } else {
    console.log(`[humanboard:migrate] ${tableName}.user_id already exists`);
  }

  await run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_user_id ON ${tableName}(user_id)`);
}

try {
  await run('PRAGMA foreign_keys = ON');
  await run(`CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT,
    content TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'manual',
    status TEXT NOT NULL DEFAULT 'inbox',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT
  )`);
  await run(`CREATE TABLE IF NOT EXISTS capability_bets (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT NOT NULL,
    thesis TEXT NOT NULL,
    baseline_conviction INTEGER NOT NULL DEFAULT 50,
    status TEXT NOT NULL DEFAULT 'watching',
    conviction INTEGER NOT NULL DEFAULT 50,
    threshold_to_commit INTEGER NOT NULL DEFAULT 80,
    salience INTEGER NOT NULL DEFAULT 35,
    keywords_json TEXT NOT NULL DEFAULT '[]',
    supporting_signal_ids_json TEXT NOT NULL DEFAULT '[]',
    contradicting_signal_ids_json TEXT NOT NULL DEFAULT '[]',
    complicating_signal_ids_json TEXT NOT NULL DEFAULT '[]',
    last_reviewed_at TEXT NOT NULL DEFAULT '',
    unlock_paths_json TEXT NOT NULL DEFAULT '[]',
    first_use_cases_json TEXT NOT NULL DEFAULT '[]',
    cost_of_not_knowing TEXT,
    review_cadence TEXT,
    strategic_note TEXT,
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT '',
    archived_at TEXT
  )`);

  await addUserIdColumnIfMissing('notes');
  await addUserIdColumnIfMissing('capability_bets');
  console.log(`[humanboard:migrate] complete db=${dbPath}`);
} finally {
  db.close();
}
