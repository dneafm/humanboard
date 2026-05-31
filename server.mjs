import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || process.env.HUMANBOARD_PORT || 3001);
const HOST = process.env.HUMANBOARD_HOST || '0.0.0.0';
const DIST_DIR = path.join(__dirname, 'dist');
const SNAPSHOT_PATH = path.resolve(process.env.HUMANBOARD_SNAPSHOT_PATH || path.join(__dirname, 'snapshot.json'));
const SNAPSHOT_BACKUP_PATH = `${SNAPSHOT_PATH}.bak`;
const CORRUPT_SNAPSHOT_DIR = path.join(path.dirname(SNAPSHOT_PATH), 'corrupt-snapshots');
const AI_ERA_DB_PATH = process.env.AI_ERA_KB_PATH || 'F:/backtest/ai-era-kb/ai_era_kb.sqlite3';
const AI_BASE_URL = String(process.env.AI_BASE_URL || process.env.GEMMA_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '');
const AI_API_KEY = String(process.env.AI_API_KEY || process.env.GEMMA_API_KEY || '').trim();

const DEFAULT_SECTIONS = [
  {
    id: 'sec1',
    name: 'Technology & Tools',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
  {
    id: 'sec2',
    name: 'Finance',
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
  {
    id: 'sec3',
    name: 'Health & Wellness',
    color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  },
  {
    id: 'sec4',
    name: 'Lifestyle & Home',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
];

const DEFAULT_SNAPSHOT = {
  notes: [],
  ideas: [],
  projects: [],
  sections: DEFAULT_SECTIONS,
  goals: [],
  reflections: [],
  capabilityBets: [],
  signalEvents: [],
  capabilityTimelineEvents: [],
  isDarkMode: false,
};

function cloneDefaultSnapshot() {
  return JSON.parse(JSON.stringify(DEFAULT_SNAPSHOT));
}

function normalizeSnapshot(raw = {}) {
  const snapshot = {
    ...cloneDefaultSnapshot(),
    ...(raw && typeof raw === 'object' ? raw : {}),
  };

  snapshot.notes = Array.isArray(snapshot.notes) ? snapshot.notes : [];
  snapshot.ideas = Array.isArray(snapshot.ideas) ? snapshot.ideas : [];
  snapshot.projects = Array.isArray(snapshot.projects) ? snapshot.projects : [];
  snapshot.sections = Array.isArray(snapshot.sections) && snapshot.sections.length ? snapshot.sections : cloneDefaultSnapshot().sections;
  snapshot.goals = Array.isArray(snapshot.goals) ? snapshot.goals : [];
  snapshot.reflections = Array.isArray(snapshot.reflections) ? snapshot.reflections : [];
  snapshot.capabilityBets = Array.isArray(snapshot.capabilityBets) ? snapshot.capabilityBets : [];
  snapshot.signalEvents = Array.isArray(snapshot.signalEvents) ? snapshot.signalEvents : [];
  snapshot.capabilityTimelineEvents = Array.isArray(snapshot.capabilityTimelineEvents) ? snapshot.capabilityTimelineEvents : [];
  snapshot.isDarkMode = Boolean(snapshot.isDarkMode);

  return snapshot;
}

function validateSnapshotCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('snapshot payload must be a JSON object');
  }
  return normalizeSnapshot(candidate);
}

async function archiveCorruptSnapshot(reason) {
  if (!existsSync(SNAPSHOT_PATH)) {
    return null;
  }

  mkdirSync(CORRUPT_SNAPSHOT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(CORRUPT_SNAPSHOT_DIR, `snapshot-${stamp}-${reason}.json`);
  copyFileSync(SNAPSHOT_PATH, archivePath);
  return archivePath;
}

async function saveSnapshot(snapshot) {
  const normalized = normalizeSnapshot(snapshot);
  await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });

  const tmpPath = `${SNAPSHOT_PATH}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8');
  await fs.rename(tmpPath, SNAPSHOT_PATH);
  copyFileSync(SNAPSHOT_PATH, SNAPSHOT_BACKUP_PATH);

  return normalized;
}

async function loadSnapshotFrom(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  return validateSnapshotCandidate(parsed);
}

async function loadSnapshotSafe() {
  if (!existsSync(SNAPSHOT_PATH)) {
    return saveSnapshot(cloneDefaultSnapshot());
  }

  try {
    return await loadSnapshotFrom(SNAPSHOT_PATH);
  } catch (primaryError) {
    const archivedPath = await archiveCorruptSnapshot('primary');

    if (existsSync(SNAPSHOT_BACKUP_PATH)) {
      try {
        const restored = await loadSnapshotFrom(SNAPSHOT_BACKUP_PATH);
        await saveSnapshot(restored);
        console.warn(`[humanboard] recovered snapshot from backup after primary parse failure: ${primaryError}`);
        return restored;
      } catch (backupError) {
        console.error(`[humanboard] backup snapshot is also invalid: ${backupError}`);
      }
    }

    const fresh = await saveSnapshot(cloneDefaultSnapshot());
    console.warn(`[humanboard] reset snapshot to default after corruption. archived=${archivedPath ?? 'none'}`);
    return fresh;
  }
}

function runAiEraBridge() {
  if (!existsSync(AI_ERA_DB_PATH)) {
    return { ideas: [] };
  }

  const py = String.raw`
import json, sqlite3, sys

db_path = sys.argv[1]
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

topics = {row['id']: row for row in cur.execute('select id, name, description from topics').fetchall()}
signals_by_entry = {}
for row in cur.execute('select entry_id, signal_text, weight from signals order by entry_id, weight desc, id asc').fetchall():
    signals_by_entry.setdefault(row['entry_id'], []).append(dict(row))

strategies_by_entry = {}
for row in cur.execute('''
    select sl.entry_id, s.name, s.category, s.description, sl.relevance_note
    from strategy_links sl
    join strategies s on s.id = sl.strategy_id
    where sl.entry_id is not null
    order by sl.entry_id, s.id
''').fetchall():
    strategies_by_entry.setdefault(row['entry_id'], []).append(dict(row))

ideas = []
for row in cur.execute('select * from entries order by id').fetchall():
    topic = topics.get(row['topic_id'])
    signals = signals_by_entry.get(row['id'], [])[:4]
    strategies = strategies_by_entry.get(row['id'], [])[:3]
    parts = []
    if topic:
        parts.append(f"Topic: {topic['name']} — {topic['description'] or ''}".strip())
    parts.append(row['summary'])
    if signals:
        parts.append('Signals:\n- ' + '\n- '.join(s['signal_text'] for s in signals))
    if strategies:
        parts.append('Related strategies:\n- ' + '\n- '.join(f"{s['name']}: {s['description']}" for s in strategies))
    ideas.append({
        'id': f"kb-aiera-entry-{row['id']}",
        'title': row['title'],
        'summary': row['summary'],
        'content': '\n\n'.join(parts),
        'type': 'Reference',
        'stage': 'Evergreen',
        'sectionId': 'sec1',
        'confidence': max(1, min(10, row['confidence'] or 7)),
        'maturity': 85,
        'nextAction': f"Action bias: {row['action_bias'] or 'none'} | Timeframe: {row['timeframe'] or 'unknown'} | Scope: {row['scope'] or 'unknown'}",
        'lastReviewed': row['created_at'].replace(' ', 'T') if row['created_at'] else '2026-03-13T00:00:00',
        'linkedNoteIds': [],
        'relatedIdeaIds': [],
    })

for row in cur.execute('select * from strategies order by id').fetchall():
    ideas.append({
        'id': f"kb-aiera-strategy-{row['id']}",
        'title': row['name'],
        'summary': row['description'],
        'content': f"Category: {row['category']}\nDifficulty: {row['difficulty'] or 'unknown'}\nLeverage: {row['leverage_type'] or 'unknown'}\n\n{row['description']}\n\nNotes: {row['notes'] or 'none'}",
        'type': 'Principle',
        'stage': 'Evergreen',
        'sectionId': 'sec1',
        'confidence': 8,
        'maturity': 90,
        'nextAction': f"Use as strategy lens for category={row['category']}",
        'lastReviewed': row['created_at'].replace(' ', 'T') if row['created_at'] else '2026-03-13T00:00:00',
        'linkedNoteIds': [],
        'relatedIdeaIds': [],
    })

for row in cur.execute('select * from personal_questions order by id').fetchall():
    ideas.append({
        'id': f"kb-aiera-question-{row['id']}",
        'title': row['question'],
        'summary': row['why_it_matters'] or 'Personal reflection prompt',
        'content': f"Question: {row['question']}\n\nWhy it matters: {row['why_it_matters'] or 'n/a'}\nStatus: {row['status'] or 'open'}",
        'type': 'Reference',
        'stage': 'Sprouting',
        'sectionId': 'sec3',
        'confidence': 7,
        'maturity': 60,
        'nextAction': 'Reflect and turn strong answers into concrete plans',
        'lastReviewed': '2026-03-13T00:00:00',
        'linkedNoteIds': [],
        'relatedIdeaIds': [],
    })

print(json.dumps({'ideas': ideas}))
`;

  const result = spawnSync('python', ['-c', py, AI_ERA_DB_PATH], {
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 8,
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'AI Era bridge failed').trim());
  }

  return JSON.parse(result.stdout || '{"ideas": []}');
}

const app = express();

app.disable('x-powered-by');
app.use(express.static(DIST_DIR, { index: false }));

app.get('/api/health', async (_req, res) => {
  const snapshotExists = existsSync(SNAPSHOT_PATH);
  const backupExists = existsSync(SNAPSHOT_BACKUP_PATH);
  res.json({
    ok: true,
    service: 'humanboard-prod',
    distReady: existsSync(path.join(DIST_DIR, 'index.html')),
    snapshotPath: SNAPSHOT_PATH,
    snapshotExists,
    snapshotBackupPath: SNAPSHOT_BACKUP_PATH,
    snapshotBackupExists: backupExists,
    aiBaseUrl: AI_BASE_URL,
  });
});

app.get('/api/snapshot', async (_req, res) => {
  try {
    const snapshot = await loadSnapshotSafe();
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/snapshot', express.json({ limit: '25mb' }), async (req, res) => {
  try {
    const snapshot = validateSnapshotCandidate(req.body);
    await saveSnapshot(snapshot);
    res.json({ success: true, snapshotPath: SNAPSHOT_PATH });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /json|payload/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

app.get('/api/ai-era-kb', (_req, res) => {
  try {
    res.json(runAiEraBridge());
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'AI Era KB bridge failed' });
  }
});

app.all(['/api/ai/*', '/api/gemma/*'], express.raw({ type: '*/*', limit: '25mb' }), async (req, res) => {
  try {
    const suffix = req.originalUrl.replace(/^\/api\/(ai|gemma)/, '');
    const targetUrl = `${AI_BASE_URL}${suffix}`;
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
      if (value == null) continue;
      const lower = key.toLowerCase();
      if (['host', 'content-length', 'origin', 'referer'].includes(lower)) continue;
      if (Array.isArray(value)) {
        headers.set(key, value.join(', '));
      } else {
        headers.set(key, value);
      }
    }

    if (AI_API_KEY && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${AI_API_KEY}`);
    }

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
      duplex: req.method === 'GET' || req.method === 'HEAD' ? undefined : 'half',
    });

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'content-length') return;
      res.setHeader(key, value);
    });

    const body = Buffer.from(await upstream.arrayBuffer());
    res.end(body);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.use(async (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }

  const indexPath = path.join(DIST_DIR, 'index.html');
  if (!existsSync(indexPath)) {
    res.status(503).type('text/plain').send('HumanBoard production build is missing. Run `npm run build:prod` first.');
    return;
  }

  res.sendFile(indexPath);
});

app.listen(PORT, HOST, () => {
  console.log(`[humanboard] production server listening on http://${HOST}:${PORT}`);
  console.log(`[humanboard] dist=${DIST_DIR}`);
  console.log(`[humanboard] snapshot=${SNAPSHOT_PATH}`);
});
