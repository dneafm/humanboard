import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { applyAiCostRecord, calculateAiCost, createEmptyAiCostState, getDailyRequestUsage, incrementDailyRequestUsage, roundUsd, toFiniteNumber } from './server/aiCostTracker.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || process.env.HUMANBOARD_PORT || 3001);
const HOST = process.env.HUMANBOARD_HOST || '0.0.0.0';
const DIST_DIR = path.join(__dirname, 'dist');
const PACKAGE_JSON_PATH = path.join(__dirname, 'package.json');
const LEGACY_SNAPSHOT_PATH = path.resolve(process.env.HUMANBOARD_SNAPSHOT_PATH || path.join(__dirname, 'snapshot.json'));
const USER_DATA_DIR = path.resolve(process.env.HUMANBOARD_USER_DATA_DIR || path.join(__dirname, 'data', 'users'));
const AI_ERA_DB_PATH = process.env.AI_ERA_KB_PATH || 'F:/backtest/ai-era-kb/ai_era_kb.sqlite3';
const AI_BASE_URL = String(process.env.AI_BASE_URL || process.env.GEMMA_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '');
const AI_API_KEY = String(process.env.AI_API_KEY || process.env.GEMMA_API_KEY || '').trim();
const AI_FALLBACK_MODEL = String(process.env.AI_FALLBACK_MODEL || '').trim();
const AI_DAILY_REQUEST_LIMIT = Math.max(1, Number(process.env.AI_DAILY_REQUEST_LIMIT || 1000));

// Initialize Firebase Admin if projectId is configured
const firebaseProjectId = process.env.VITE_FIREBASE_PROJECT_ID;
let isFirebaseAdminInitialized = false;
let firebaseAuth = null;

if (firebaseProjectId) {
  try {
    const adminApp = admin.initializeApp({
      projectId: firebaseProjectId,
    });
    firebaseAuth = getAuth(adminApp);
    isFirebaseAdminInitialized = true;
    console.log(`Firebase Admin initialized successfully for project: ${firebaseProjectId}`);
  } catch (err) {
    console.error('Failed to initialize Firebase Admin SDK:', err);
  }
}

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
  chatMessages: [],
  fusionItems: [],
  fusionSuggestions: [],
  lastDailyFusionScan: '',
  chatThreads: [],
  activeThreadId: '',
};

let appVersion = '0.0.0';
try {
  const packageJson = JSON.parse(await fs.readFile(PACKAGE_JSON_PATH, 'utf-8'));
  appVersion = String(packageJson.version || '0.0.0');
} catch (error) {
  console.warn('[humanboard] failed to read package.json version:', error);
}

const GITHUB_REPO = process.env.HUMANBOARD_GITHUB_REPO || 'dneafm/humanboard';
const AI_PRICING_CACHE_TTL_MS = 1000 * 60 * 10;
const EVENT_LOG_LIMIT = 200;

let aiPricingCache = {
  fetchedAt: 0,
  models: new Map(),
};

const runtimeEvents = [];

function pushRuntimeEvent(level, type, message, meta = {}) {
  runtimeEvents.unshift({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    level,
    type,
    message,
    meta,
  });
  if (runtimeEvents.length > EVENT_LOG_LIMIT) {
    runtimeEvents.length = EVENT_LOG_LIMIT;
  }
}

function normalizeVersionTag(value) {
  return String(value || '')
    .trim()
    .replace(/^refs\/tags\//, '')
    .replace(/^v/i, '');
}

function compareVersions(a, b) {
  const parse = (value) => normalizeVersionTag(value).split(/[^0-9]+/).filter(Boolean).map(Number);
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

function resolveGithubLatestVersion() {
  try {
    const releaseRaw = execFileSync('git', ['ls-remote', '--tags', '--refs', `https://github.com/${GITHUB_REPO}.git`], {
      encoding: 'utf-8',
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    const tags = releaseRaw
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/)[1])
      .filter(Boolean)
      .map((ref) => ref.replace(/^refs\/tags\//, ''));

    if (!tags.length) {
      return null;
    }

    return tags.sort((a, b) => compareVersions(b, a))[0] ?? null;
  } catch (error) {
    console.warn('[humanboard] failed to resolve latest GitHub tag:', error);
    return null;
  }
}

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
  snapshot.fusionItems = Array.isArray(snapshot.fusionItems) ? snapshot.fusionItems : [];
  snapshot.fusionSuggestions = Array.isArray(snapshot.fusionSuggestions) ? snapshot.fusionSuggestions : [];
  snapshot.lastDailyFusionScan = String(snapshot.lastDailyFusionScan || '');
  
  snapshot.chatThreads = Array.isArray(snapshot.chatThreads) ? snapshot.chatThreads : [];
  snapshot.activeThreadId = String(snapshot.activeThreadId || '');
  
  const chatCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  snapshot.chatMessages = (Array.isArray(snapshot.chatMessages) ? snapshot.chatMessages : [])
    .filter(m => m && m.createdAt && m.createdAt >= chatCutoff);

  if (snapshot.chatThreads.length === 0 && snapshot.chatMessages.length > 0) {
    snapshot.chatThreads.push({
      id: 'legacy-thread',
      title: 'Legacy Chat',
      messages: snapshot.chatMessages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    snapshot.activeThreadId = 'legacy-thread';
  }
  snapshot.aiCostTracking = snapshot.aiCostTracking && typeof snapshot.aiCostTracking === 'object'
    ? {
        totals: {
          requests: toFiniteNumber(snapshot.aiCostTracking?.totals?.requests, 0),
          promptTokens: toFiniteNumber(snapshot.aiCostTracking?.totals?.promptTokens, 0),
          completionTokens: toFiniteNumber(snapshot.aiCostTracking?.totals?.completionTokens, 0),
          totalTokens: toFiniteNumber(snapshot.aiCostTracking?.totals?.totalTokens, 0),
          estimatedUsd: roundUsd(snapshot.aiCostTracking?.totals?.estimatedUsd ?? 0),
        },
        byModel: snapshot.aiCostTracking?.byModel && typeof snapshot.aiCostTracking.byModel === 'object'
          ? snapshot.aiCostTracking.byModel
          : {},
        recent: Array.isArray(snapshot.aiCostTracking?.recent) ? snapshot.aiCostTracking.recent.slice(0, 100) : [],
        dailyRequests: {
          day: String(snapshot.aiCostTracking?.dailyRequests?.day || ''),
          count: toFiniteNumber(snapshot.aiCostTracking?.dailyRequests?.count, 0),
        },
      }
    : createEmptyAiCostState();

  return snapshot;
}

async function getAiModelPricingMap() {
  const now = Date.now();
  if (aiPricingCache.fetchedAt && now - aiPricingCache.fetchedAt < AI_PRICING_CACHE_TTL_MS && aiPricingCache.models.size) {
    return aiPricingCache.models;
  }

  const headers = new Headers({ accept: 'application/json' });
  if (AI_API_KEY) headers.set('authorization', `Bearer ${AI_API_KEY}`);

  const response = await fetch(`${AI_BASE_URL}/models`, { headers });
  if (!response.ok) {
    throw new Error(`pricing lookup failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  const models = new Map();
  for (const model of Array.isArray(payload?.data) ? payload.data : []) {
    models.set(String(model.id || ''), {
      prompt: toFiniteNumber(model?.pricing?.prompt, 0),
      completion: toFiniteNumber(model?.pricing?.completion, 0),
      inputCacheRead: toFiniteNumber(model?.pricing?.input_cache_read, 0),
      inputCacheWrite: toFiniteNumber(model?.pricing?.input_cache_write, 0),
    });
  }

  aiPricingCache = { fetchedAt: now, models };
  return models;
}

const userSnapshotLocks = new Map();

async function withUserSnapshotLock(userId, operation) {
  const previous = userSnapshotLocks.get(userId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  userSnapshotLocks.set(userId, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (userSnapshotLocks.get(userId) === tail) {
      userSnapshotLocks.delete(userId);
    }
  }
}

async function recordAiChatCost(userId, requestMeta, responsePayload) {
  const modelId = String(responsePayload?.model || requestMeta?.model || '').trim();
  const usage = responsePayload?.usage;
  if (!userId || !modelId || !usage) return null;

  const pricingMap = await getAiModelPricingMap();
  const pricing = pricingMap.get(modelId);
  if (!pricing) return null;

  const { promptTokens, completionTokens, totalTokens, estimatedUsd } = calculateAiCost(pricing, usage);

  await withUserSnapshotLock(userId, async () => {
    const snapshot = await loadSnapshotSafe(userId);
    snapshot.aiCostTracking = applyAiCostRecord(snapshot.aiCostTracking || createEmptyAiCostState(), {
      at: new Date().toISOString(),
      requestId: requestMeta.requestId,
      path: requestMeta.path,
      modelId,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedUsd,
    });
    await saveSnapshot(userId, snapshot);
  });

  return { modelId, promptTokens, completionTokens, totalTokens, estimatedUsd };
}

function nextUtcDayIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

async function consumeAiDailyRequest(userId, now = new Date()) {
  return withUserSnapshotLock(userId, async () => {
    const snapshot = await loadSnapshotSafe(userId);
    const usage = getDailyRequestUsage(snapshot.aiCostTracking, now);
    if (usage.count >= AI_DAILY_REQUEST_LIMIT) {
      return { allowed: false, limit: AI_DAILY_REQUEST_LIMIT, used: usage.count, resetAt: nextUtcDayIso(now) };
    }
    snapshot.aiCostTracking = incrementDailyRequestUsage(snapshot.aiCostTracking, now);
    await saveSnapshot(userId, snapshot);
    return { allowed: true, limit: AI_DAILY_REQUEST_LIMIT, used: usage.count + 1, resetAt: nextUtcDayIso(now) };
  });
}

function validateSnapshotCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('snapshot payload must be a JSON object');
  }
  return normalizeSnapshot(candidate);
}

async function getRequestUserId(req) {
  // 1. Try to verify Firebase ID Token from Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) {
      if (isFirebaseAdminInitialized && firebaseAuth) {
        try {
          const decodedToken = await firebaseAuth.verifyIdToken(token);
          return decodedToken.uid;
        } catch (error) {
          console.error('Firebase token verification failed:', error.message);
          return null;
        }
      }
    }
  }

  // 2. Fallback to X-User-ID header if Firebase Admin is NOT initialized (dev/fallback mode)
  if (!isFirebaseAdminInitialized) {
    const raw = req.headers['x-user-id'];
    const userId = Array.isArray(raw) ? raw[0] : raw;
    const normalized = String(userId || '').trim();
    return normalized || null;
  }

  return null;
}

function sanitizeUserIdForPath(userId) {
  return userId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

function getUserSnapshotPaths(userId) {
  const safeUserId = sanitizeUserIdForPath(userId);
  const userDir = path.join(USER_DATA_DIR, safeUserId);
  const snapshotPath = path.join(userDir, 'snapshot.json');

  return {
    userDir,
    snapshotPath,
    snapshotBackupPath: `${snapshotPath}.bak`,
    corruptSnapshotDir: path.join(userDir, 'corrupt-snapshots'),
  };
}

async function requireUserId(req, res) {
  const userId = await getRequestUserId(req);

  if (!userId) {
    if (isFirebaseAdminInitialized) {
      res.status(401).json({ error: 'Unauthorized: Invalid or missing Firebase token' });
    } else {
      res.status(400).json({ error: 'Missing Header: X-User-ID' });
    }
    return null;
  }

  return userId;
}

function decodeHtmlEntities(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripHtmlToText(html = '') {
  return decodeHtmlEntities(
    String(html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/article|\/section|\/tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

function extractPageTitle(html = '') {
  const match = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return stripHtmlToText(match?.[1] || '').slice(0, 200);
}

function extractMetaDescription(html = '') {
  const match = String(html).match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i)
    || String(html).match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i)
    || String(html).match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i);
  return decodeHtmlEntities((match?.[1] || '').trim()).slice(0, 400);
}

function extractReadableTextFromHtml(html = '') {
  const articleMatch = String(html).match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = String(html).match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const content = articleMatch?.[1] || mainMatch?.[1] || html;
  return stripHtmlToText(content).slice(0, 20000);
}

async function archiveCorruptSnapshot(paths, reason) {
  if (!existsSync(paths.snapshotPath)) {
    return null;
  }

  mkdirSync(paths.corruptSnapshotDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(paths.corruptSnapshotDir, `snapshot-${stamp}-${reason}.json`);
  copyFileSync(paths.snapshotPath, archivePath);
  return archivePath;
}

async function saveSnapshot(userId, snapshot) {
  const paths = getUserSnapshotPaths(userId);
  const normalized = normalizeSnapshot(snapshot);
  await fs.mkdir(paths.userDir, { recursive: true });

  const tmpPath = `${paths.snapshotPath}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8');
  await fs.rename(tmpPath, paths.snapshotPath);
  copyFileSync(paths.snapshotPath, paths.snapshotBackupPath);
  pushRuntimeEvent('info', 'snapshot_saved', 'User snapshot saved', { userId, snapshotPath: paths.snapshotPath });

  return normalized;
}

async function loadSnapshotFrom(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  return validateSnapshotCandidate(parsed);
}

async function loadSnapshotSafe(userId) {
  const paths = getUserSnapshotPaths(userId);

  if (!existsSync(paths.snapshotPath)) {
    return saveSnapshot(userId, cloneDefaultSnapshot());
  }

  try {
    return await loadSnapshotFrom(paths.snapshotPath);
  } catch (primaryError) {
    const archivedPath = await archiveCorruptSnapshot(paths, 'primary');

    if (existsSync(paths.snapshotBackupPath)) {
      try {
        const restored = await loadSnapshotFrom(paths.snapshotBackupPath);
        await saveSnapshot(userId, restored);
        console.warn(`[humanboard] recovered snapshot from backup after primary parse failure: ${primaryError}`);
        return restored;
      } catch (backupError) {
        console.error(`[humanboard] backup snapshot is also invalid: ${backupError}`);
      }
    }

    const fresh = await saveSnapshot(userId, cloneDefaultSnapshot());
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

  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(pythonCmd, ['-c', py, AI_ERA_DB_PATH], {
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
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-ID');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});
app.use(express.static(DIST_DIR, { index: false }));

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    service: 'humanboard-prod',
    distReady: existsSync(path.join(DIST_DIR, 'index.html')),
    legacySnapshotPath: LEGACY_SNAPSHOT_PATH,
    userDataDir: USER_DATA_DIR,
    aiBaseUrl: AI_BASE_URL,
  });
});

app.get('/api/version', async (_req, res) => {
  const latestGithubVersion = resolveGithubLatestVersion();
  const updateAvailable = latestGithubVersion ? compareVersions(latestGithubVersion, appVersion) > 0 : false;

  res.json({
    version: appVersion,
    githubRepo: GITHUB_REPO,
    latestGithubVersion,
    updateAvailable,
  });
});

app.get('/api/ai-costs', async (req, res) => {
  const userId = await requireUserId(req, res);
  if (!userId) return;

  try {
    const snapshot = await loadSnapshotSafe(userId);
    res.json(snapshot.aiCostTracking || createEmptyAiCostState());
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load AI cost tracking' });
  }
});

app.get('/api/admin/overview', async (_req, res) => {
  try {
    if (!existsSync(USER_DATA_DIR)) {
      res.json({ users: [], totals: { users: 0, notes: 0, ideas: 0, projects: 0, goals: 0, reflections: 0, capabilityBets: 0, signalEvents: 0, trackedRequests: 0, trackedUsd: 0 } });
      return;
    }

    const entries = await fs.readdir(USER_DATA_DIR, { withFileTypes: true });
    const users = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const userId = entry.name;
      try {
        const snapshot = await loadSnapshotSafe(userId);
        const stats = await fs.stat(path.join(USER_DATA_DIR, userId, 'snapshot.json'));
        const aiCost = snapshot.aiCostTracking || createEmptyAiCostState();
        users.push({
          userId,
          notes: snapshot.notes.length,
          ideas: snapshot.ideas.length,
          projects: snapshot.projects.length,
          goals: snapshot.goals.length,
          reflections: snapshot.reflections.length,
          capabilityBets: snapshot.capabilityBets.length,
          signalEvents: snapshot.signalEvents.length,
          trackedRequests: aiCost.totals.requests,
          trackedUsd: aiCost.totals.estimatedUsd,
          lastUpdatedAt: stats.mtime.toISOString(),
        });
      } catch (error) {
        users.push({
          userId,
          error: error instanceof Error ? error.message : String(error),
          notes: 0,
          ideas: 0,
          projects: 0,
          goals: 0,
          reflections: 0,
          capabilityBets: 0,
          signalEvents: 0,
          trackedRequests: 0,
          trackedUsd: 0,
          lastUpdatedAt: null,
        });
      }
    }

    users.sort((a, b) => (b.trackedUsd || 0) - (a.trackedUsd || 0));
    const totals = users.reduce((acc, user) => {
      acc.users += 1;
      acc.notes += user.notes || 0;
      acc.ideas += user.ideas || 0;
      acc.projects += user.projects || 0;
      acc.goals += user.goals || 0;
      acc.reflections += user.reflections || 0;
      acc.capabilityBets += user.capabilityBets || 0;
      acc.signalEvents += user.signalEvents || 0;
      acc.trackedRequests += user.trackedRequests || 0;
      acc.trackedUsd += user.trackedUsd || 0;
      return acc;
    }, { users: 0, notes: 0, ideas: 0, projects: 0, goals: 0, reflections: 0, capabilityBets: 0, signalEvents: 0, trackedRequests: 0, trackedUsd: 0 });

    res.json({ users, totals });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load admin overview' });
  }
});

app.get('/api/admin/events', async (_req, res) => {
  res.json({ events: runtimeEvents.slice(0, 100) });
});

app.post('/api/snapshot/reset', async (req, res) => {
  const userId = await requireUserId(req, res);
  if (!userId) return;

  try {
    const snapshot = await withUserSnapshotLock(userId, async () => {
      const current = await loadSnapshotSafe(userId);
      const reset = cloneDefaultSnapshot();
      reset.aiCostTracking = current.aiCostTracking;
      return saveSnapshot(userId, reset);
    });
    res.json({ success: true, snapshot });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to reset snapshot' });
  }
});

app.get('/api/snapshot', async (req, res) => {
  const userId = await requireUserId(req, res);
  if (!userId) return;

  try {
    const snapshot = await loadSnapshotSafe(userId);
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/snapshot', express.json({ limit: '25mb' }), async (req, res) => {
  const userId = await requireUserId(req, res);
  if (!userId) return;

  try {
    await withUserSnapshotLock(userId, async () => {
      const current = await loadSnapshotSafe(userId);
      const snapshot = validateSnapshotCandidate(req.body);
      snapshot.aiCostTracking = current.aiCostTracking;
      await saveSnapshot(userId, snapshot);
    });
    res.json({ success: true, snapshotPath: getUserSnapshotPaths(userId).snapshotPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /json|payload/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

app.get('/api/ai-era-kb', async (req, res) => {
  const ownerId = process.env.HUMANBOARD_OWNER_ID;
  if (ownerId) {
    const userId = await getRequestUserId(req);
    const allowedOwners = ownerId.split(',').map(id => id.trim());
    if (!userId || !allowedOwners.includes(userId)) {
      res.status(403).json({ error: 'Forbidden: Access to AI Era KB is restricted to the owner.' });
      return;
    }
  }

  try {
    res.json(runAiEraBridge());
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'AI Era KB bridge failed' });
  }
});

app.post('/api/extract-web', express.json({ limit: '1mb' }), async (req, res) => {
  const userId = await requireUserId(req, res);
  if (!userId) return;

  const rawUrl = String(req.body?.url || '').trim();
  if (!rawUrl) {
    res.status(400).json({ error: 'Missing url' });
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  if (!/^https?:$/.test(parsedUrl.protocol)) {
    res.status(400).json({ error: 'Only http/https URLs are supported' });
    return;
  }

  try {
    const response = await fetch(parsedUrl.toString(), {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; HumanBoardBot/1.0; +https://humanboardapp.xyz)',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
      },
    });

    if (!response.ok) {
      res.status(502).json({ error: `Failed to fetch URL (HTTP ${response.status})` });
      return;
    }

    const contentType = String(response.headers.get('content-type') || '');
    const rawBody = await response.text();
    const isHtml = /text\/html|application\/xhtml\+xml/i.test(contentType) || /<html|<body|<article|<main/i.test(rawBody);
    const title = isHtml ? extractPageTitle(rawBody) : parsedUrl.hostname;
    const description = isHtml ? extractMetaDescription(rawBody) : '';
    const content = isHtml ? extractReadableTextFromHtml(rawBody) : rawBody.trim().slice(0, 20000);

    if (!content.trim()) {
      res.status(422).json({ error: 'Could not extract readable content from URL' });
      return;
    }

    res.json({
      url: parsedUrl.toString(),
      title,
      description,
      content,
      contentType,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to extract web content' });
  }
});

app.all(['/api/ai/*', '/api/gemma/*'], express.raw({ type: '*/*', limit: '25mb' }), async (req, res) => {
  const startedAt = Date.now();
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const isGemmaChat = /^\/api\/(?:ai|gemma)\/chat\/completions(?:\?|$)/.test(req.originalUrl);
  const userId = await getRequestUserId(req);
  try {
    if (isGemmaChat) {
      if (!userId) {
        if (isFirebaseAdminInitialized) {
          res.status(401).json({ error: 'Unauthorized: Invalid or missing Firebase token' });
        } else {
          res.status(400).json({ error: 'Missing Header: X-User-ID' });
        }
        return;
      }
      const quota = await consumeAiDailyRequest(userId);
      res.setHeader('x-humanboard-ai-daily-limit', String(quota.limit));
      res.setHeader('x-humanboard-ai-daily-used', String(quota.used));
      res.setHeader('x-humanboard-ai-daily-reset', quota.resetAt);
      if (!quota.allowed) {
        const message = `Daily AI request limit reached (${quota.limit}).`;
        pushRuntimeEvent('warn', 'ai_quota_blocked', message, { userId, limit: quota.limit, used: quota.used, resetAt: quota.resetAt });
        res.status(429).json({ error: message, code: 'AI_DAILY_REQUEST_LIMIT', ...quota });
        return;
      }
    }

    const suffix = req.originalUrl.replace(/^\/api\/(ai|gemma)/, '');
    const targetUrl = `${AI_BASE_URL}${suffix}`;
    const headers = new Headers({
      'content-type': req.headers['content-type'] || 'application/json',
      accept: req.headers.accept || 'application/json',
    });

    if (isGemmaChat) {
      const startMessage = `[humanboard][ai-proxy][start] id=${requestId} method=${req.method} path=${req.originalUrl} origin=${req.headers.origin || '-'} ua=${JSON.stringify(req.headers['user-agent'] || '-')}`;
      console.log(startMessage);
      pushRuntimeEvent('info', 'ai_proxy_start', startMessage, { requestId, path: req.originalUrl, userId });
    }

    if (AI_API_KEY) {
      headers.set('authorization', `Bearer ${AI_API_KEY}`);
    }

    let upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
      duplex: req.method === 'GET' || req.method === 'HEAD' ? undefined : 'half',
    });

    if (isGemmaChat && upstream.status >= 500 && AI_FALLBACK_MODEL) {
      try {
        const fallbackPayload = JSON.parse(Buffer.from(req.body || []).toString('utf-8'));
        const primaryModel = String(fallbackPayload?.model || '').trim();
        if (primaryModel && primaryModel !== AI_FALLBACK_MODEL) {
          const fallbackMessage = `[humanboard][ai-proxy][fallback] id=${requestId} primary=${primaryModel} status=${upstream.status} fallback=${AI_FALLBACK_MODEL}`;
          console.warn(fallbackMessage);
          pushRuntimeEvent('warn', 'ai_proxy_fallback', fallbackMessage, { requestId, primaryModel, primaryStatus: upstream.status, fallbackModel: AI_FALLBACK_MODEL, userId });
          fallbackPayload.model = AI_FALLBACK_MODEL;
          upstream = await fetch(targetUrl, {
            method: req.method,
            headers,
            body: Buffer.from(JSON.stringify(fallbackPayload)),
            duplex: 'half',
          });
          res.setHeader('x-humanboard-ai-fallback-model', AI_FALLBACK_MODEL);
        }
      } catch (fallbackError) {
        console.warn(`[humanboard][ai-proxy][fallback-error] id=${requestId} message=${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
      }
    }

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === 'content-length') return;
      if (lower === 'content-encoding') return;
      if (lower === 'transfer-encoding') return;
      res.setHeader(key, value);
    });

    const body = Buffer.from(await upstream.arrayBuffer());
    if (isGemmaChat && upstream.ok && userId) {
      try {
        const payload = JSON.parse(body.toString('utf-8'));
        let requestModel = '';
        try {
          const parsedBody = JSON.parse(Buffer.from(req.body || []).toString('utf-8'));
          requestModel = String(parsedBody?.model || '').trim();
        } catch {
          requestModel = '';
        }

        const costRecord = await recordAiChatCost(userId, {
          requestId,
          path: req.originalUrl,
          model: requestModel,
        }, payload);

        if (costRecord) {
          res.setHeader('x-humanboard-cost-usd', String(costRecord.estimatedUsd));
          res.setHeader('x-humanboard-cost-model', costRecord.modelId);
        }
      } catch (trackingError) {
        console.warn(`[humanboard][ai-proxy][cost-track-error] id=${requestId} message=${trackingError instanceof Error ? trackingError.message : String(trackingError)}`);
      }
    }

    if (isGemmaChat) {
      const doneMessage = `[humanboard][ai-proxy][done] id=${requestId} status=${upstream.status} ms=${Date.now() - startedAt} bytes=${body.length}`;
      console.log(doneMessage);
      pushRuntimeEvent(upstream.ok ? 'info' : 'warn', 'ai_proxy_done', doneMessage, { requestId, status: upstream.status, userId });
    }
    res.end(body);
  } catch (error) {
    if (isGemmaChat) {
      const errorMessage = `[humanboard][ai-proxy][error] id=${requestId} ms=${Date.now() - startedAt} message=${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMessage);
      pushRuntimeEvent('error', 'ai_proxy_error', errorMessage, { requestId, userId });
    }
    res.status(502).json({ error: error instanceof Error ? error.message : String(error), requestId });
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
  console.log(`[humanboard] userDataDir=${USER_DATA_DIR}`);
});
