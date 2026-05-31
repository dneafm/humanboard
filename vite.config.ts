import { execFileSync } from 'child_process';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs/promises';
import {defineConfig, loadEnv} from 'vite';

function createAiEraKbBridgePlugin() {
  const DB_PATH = 'F:/backtest/ai-era-kb/ai_era_kb.sqlite3';

  return {
    name: 'ai-era-kb-bridge',
    configureServer(server: any) {
      server.middlewares.use('/api/ai-era-kb', (_req: any, res: any) => {
        try {
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

          const output = execFileSync('python', ['-c', py, DB_PATH], {
            encoding: 'utf-8',
            maxBuffer: 1024 * 1024 * 8,
          });

          res.setHeader('Content-Type', 'application/json');
          res.end(output);
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: error instanceof Error ? error.message : 'AI Era KB bridge failed',
          }));
        }
      });
    },
  };
}

function createSnapshotPersistencePlugin() {
  const SNAPSHOT_PATH = path.resolve(__dirname, 'snapshot.json');

  return {
    name: 'snapshot-persistence',
    configureServer(server: any) {
      server.middlewares.use('/api/snapshot', async (req: any, res: any) => {
        try {
          if (req.method === 'GET') {
            try {
              const data = await fs.readFile(SNAPSHOT_PATH, 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.end(data);
            } catch (err: any) {
              if (err.code === 'ENOENT') {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Snapshot not found' }));
              } else {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            }
          } else if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: any) => {
              body += chunk.toString();
            });
            req.on('end', async () => {
              try {
                await fs.writeFile(SNAPSHOT_PATH, body, 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true }));
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else {
            res.statusCode = 405;
            res.end();
          }
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(error) }));
        }
      });
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), createAiEraKbBridgePlugin(), createSnapshotPersistencePlugin()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMMA_BASE_URL': JSON.stringify(env.GEMMA_BASE_URL),
      'process.env.GEMMA_MODEL': JSON.stringify(env.GEMMA_MODEL),
      'process.env.GEMMA_API_KEY': JSON.stringify(env.GEMMA_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      watch: {
        ignored: ['**/snapshot.json'],
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      allowedHosts: ['desktop-ueblqsi.tail1d75be.ts.net', '100.112.81.33'],
      proxy: {
        '/api/gemma': {
          target: 'http://127.0.0.1:11434',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/gemma/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
            });
          },
        },
      },
    },
  };
});
