import argparse
import csv
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import uuid
import urllib.request
from functools import lru_cache
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent.parent
BACKTESTS_DIR = ROOT / 'backtests'
SCRIPT_PATH = ROOT / 'local_rsi_backtest.py'
HTML_PATH = BACKTESTS_DIR / 'index.html'
LAST_RUN_PATH = BACKTESTS_DIR / 'last_run_result.json'

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / '.env')
except Exception:
    pass

_SESSIONS = {}
_SESSIONS_LOCK = threading.Lock()

def _verify_google_token(id_token: str, client_id: str | None = None) -> dict | None:
    url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
    try:
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if client_id and data.get('aud') != client_id:
                print(f"[auth] Token audience mismatch: {data.get('aud')} vs {client_id}")
                return None
            return data
    except Exception as e:
        print(f"[auth] Token verification failed: {e}")
        return None
_JOBS: dict = {}
_JOBS_LOCK = threading.Lock()
BALANCED_TF_ORDER_VALUES = {
    '1m': 22.0,
    '3m': 24.0,
    '5m': 27.0,
    '15m': 33.0,
    '30m': 44.0,
    '1h': 55.0,
    '4h': 88.0,
    '1d': 132.0,
}

# Ensure local repo modules (e.g. local_rsi_backtest.py) import reliably regardless
# of how this server is launched (cwd, shortcuts, IDE run config, etc).
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _discover_files():
    BACKTESTS_DIR.mkdir(exist_ok=True)
    csvs = sorted([str(p.relative_to(ROOT)).replace('\\', '/') for p in BACKTESTS_DIR.glob('*.csv')])
    profiles = sorted([str(p.relative_to(ROOT)).replace('\\', '/') for p in BACKTESTS_DIR.glob('*profile*.json')])
    default_csv = next((p for p in csvs if 'btcusdt_1m_futures_last6mo' in p.lower()),
                       next((p for p in csvs if 'btcusdt_15m_futures_last6mo' in p.lower()), (csvs[0] if csvs else '')))
    default_profile = next((p for p in profiles if 'btc_current_rsi_profile' in p.lower()), (profiles[0] if profiles else ''))
    return {
        'csvs': csvs,
        'profiles': profiles,
        'default_csv': default_csv,
        'default_profile': default_profile,
        'script_exists': SCRIPT_PATH.exists(),
    }


def _safe_rel_path(rel_str: str) -> Path:
    if not rel_str:
        raise ValueError('Empty path')
    p = (ROOT / str(rel_str)).resolve()
    if ROOT not in p.parents and p != ROOT:
        raise ValueError('Path escapes repo root')
    if not p.exists():
        raise FileNotFoundError(str(p))
    return p


def _read_trades_preview(csv_path: Path, limit: int = 120):
    if not csv_path.exists():
        return []
    out = []
    try:
        with csv_path.open('r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for i, row in enumerate(reader):
                if i >= limit:
                    break
                out.append(dict(row))
    except Exception:
        return []
    return out


def _read_csv_rows(csv_path: Path, limit=None):
    if not csv_path.exists():
        return []
    out = []
    try:
        with csv_path.open('r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for i, row in enumerate(reader):
                if (limit is not None) and i >= int(limit):
                    break
                out.append(dict(row))
    except Exception:
        return []
    return out


def _read_json_file(path: Path):
    try:
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return None


def _parse_tf_order_values_map(raw) -> dict:
    out = {}
    if isinstance(raw, dict):
        for k, v in raw.items():
            tf = str(k or '').strip()
            try:
                out[tf] = float(v)
            except Exception:
                continue
        return out
    s = str(raw or '').strip()
    if not s:
        return out
    for part in s.split(','):
        frag = str(part or '').strip()
        if not frag or ':' not in frag:
            continue
        k, v = frag.split(':', 1)
        tf = str(k or '').strip()
        try:
            out[tf] = float(str(v or '').strip())
        except Exception:
            continue
    return out


def _resolve_batch_tf_order_values(payload: dict) -> dict:
    out = dict(BALANCED_TF_ORDER_VALUES)
    profile_rel = str((payload or {}).get('config_json') or '').strip()
    if profile_rel:
        try:
            profile_path = _safe_rel_path(profile_rel)
            profile_json = _read_json_file(profile_path) or {}
            if isinstance(profile_json, dict):
                parsed = _parse_tf_order_values_map(profile_json.get('rsi_tf_order_values'))
                for tf, val in parsed.items():
                    if val > 0:
                        out[str(tf)] = float(val)
        except Exception:
            pass
    return out


def _json_safe(value):
    try:
        return json.loads(json.dumps(value))
    except Exception:
        try:
            return json.loads(json.dumps(value, default=str))
        except Exception:
            return {'repr': repr(value)}


def _persist_last_run(request_payload: dict, result: dict, source: str, job_id: str | None = None):
    BACKTESTS_DIR.mkdir(exist_ok=True)
    payload = {
        'ok': True,
        'saved_at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'saved_at_epoch': time.time(),
        'source': str(source or 'unknown'),
        'job_id': str(job_id) if job_id else None,
        'request': _json_safe(dict(request_payload or {})),
        'result': _json_safe(dict(result or {})),
    }
    tmp = LAST_RUN_PATH.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(LAST_RUN_PATH)


@lru_cache(maxsize=8)
def _load_csv_df_cached(abs_path: str):
    from local_rsi_backtest import load_ohlcv_csv
    return load_ohlcv_csv(Path(abs_path))


def _candles_for_ui(payload: dict) -> dict:
    from local_rsi_backtest import aggregate_ohlcv, _ts_filter, normalize_rsi_timeframe

    csv_rel = str((payload or {}).get('csv') or '').strip()
    tf = normalize_rsi_timeframe(str((payload or {}).get('tf') or '1m').strip())
    start = str((payload or {}).get('start') or '').strip() or None
    end = str((payload or {}).get('end') or '').strip() or None
    try:
        max_bars = int((payload or {}).get('max_bars') or 3000)
    except Exception:
        max_bars = 3000
    max_bars = max(200, min(50000, max_bars))
    tail_only = bool((payload or {}).get('tail_only', True))

    csv_path = _safe_rel_path(csv_rel)
    df = _load_csv_df_cached(str(csv_path))
    work = df
    if start or end:
        work = _ts_filter(df, start, end)
    agg = aggregate_ohlcv(work, tf).reset_index(drop=True)
    total = int(len(agg))
    if total == 0:
        return {'ok': True, 'candles': [], 'total_bars': 0, 'returned_bars': 0, 'timeframe': tf}

    if total > max_bars:
        if tail_only:
            agg = agg.iloc[-max_bars:].reset_index(drop=True)
        else:
            stride = max(1, total // max_bars)
            agg = agg.iloc[::stride].reset_index(drop=True)

    candles = []
    for _, r in agg.iterrows():
        candles.append({
            'time': int(int(r['ts_ms']) // 1000),
            'open': float(r['open']),
            'high': float(r['high']),
            'low': float(r['low']),
            'close': float(r['close']),
        })
    return {
        'ok': True,
        'csv': str(csv_rel),
        'timeframe': tf,
        'total_bars': total,
        'returned_bars': len(candles),
        'tail_only': bool(tail_only),
        'max_bars': int(max_bars),
        'candles': candles,
    }


def _read_equity_curve_json(path: Path, max_points: int = 5000):
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return []
    if not isinstance(raw, list):
        return []
    rows = []
    for item in raw:
        if not isinstance(item, (list, tuple)) or len(item) < 2:
            continue
        try:
            ts = int(item[0])
            eq = float(item[1])
            realized = float(item[2]) if len(item) > 2 else float('nan')
            unreal = float(item[3]) if len(item) > 3 else float('nan')
        except Exception:
            continue
        rows.append([ts, eq, realized, unreal])
    if not rows:
        return []
    rows.sort(key=lambda x: x[0])
    try:
        max_points = int(max_points)
    except Exception:
        max_points = 5000
    max_points = max(300, min(50000, max_points))
    n = len(rows)
    if n <= max_points:
        return rows
    stride = max(1, n // max_points)
    out = rows[::stride]
    if out[-1][0] != rows[-1][0]:
        out.append(rows[-1])
    return out


def _run_backtest_single(payload: dict, progress_cb=None) -> dict:
    if not SCRIPT_PATH.exists():
        raise FileNotFoundError(f'Missing script: {SCRIPT_PATH}')

    csv_rel = str((payload or {}).get('csv') or '').strip()
    profile_rel = str((payload or {}).get('config_json') or '').strip()
    symbol = str((payload or {}).get('symbol') or 'BTC').strip().upper()
    tf = str((payload or {}).get('tf') or '15m').strip()
    order_value = (payload or {}).get('order_value', 33)
    start = str((payload or {}).get('start') or '').strip()
    end = str((payload or {}).get('end') or '').strip()

    csv_path = _safe_rel_path(csv_rel)
    profile_path = _safe_rel_path(profile_rel) if profile_rel else None

    extra_flags = []
    if bool((payload or {}).get('no_divergence', False)):
        extra_flags.append('--no-divergence')
    if bool((payload or {}).get('no_trend_filter', False)):
        extra_flags.append('--no-trend-filter')
    if bool((payload or {}).get('no_trend_size_bias', False)):
        extra_flags.append('--no-trend-size-bias')
    if 'no_htf_bias' in (payload or {}):
        extra_flags.append('--no-htf-bias' if bool((payload or {}).get('no_htf_bias', False)) else '--htf-bias')
    if bool((payload or {}).get('no_shock_guard', False)):
        extra_flags.append('--no-shock-guard')
    if 'no_atr_guard' in (payload or {}):
        extra_flags.append('--no-atr-guard' if bool((payload or {}).get('no_atr_guard', False)) else '--atr-guard')
    if 'no_harvest_guard' in (payload or {}):
        extra_flags.append('--no-harvest-guard' if bool((payload or {}).get('no_harvest_guard', False)) else '--harvest-guard')

    with tempfile.TemporaryDirectory(prefix='bt_ui_') as td:
        td_path = Path(td)
        summary_out = td_path / 'summary.json'
        trades_out = td_path / 'trades.csv'
        equity_out = td_path / 'equity.json'
        progress_out = td_path / 'progress.json'
        cmd = [
            sys.executable,
            str(SCRIPT_PATH),
            '--csv', str(csv_path),
            '--symbol', symbol,
            '--tf', tf,
            '--order-value', str(order_value),
            '--summary-out', str(summary_out),
            '--trades-out', str(trades_out),
            '--equity-out', str(equity_out),
            '--progress-out', str(progress_out),
        ]
        if profile_path:
            cmd += ['--config-json', str(profile_path)]
        if start:
            cmd += ['--start', start]
        if end:
            cmd += ['--end', end]

        mapping = {
            'rsi_unwind_delta': '--rsi-unwind-delta',
            'rsi_reentry_cooldown_sec': '--rsi-reentry-cooldown-sec',
            'warmup_bars': '--warmup-bars',
            'maker_fee_bps': '--maker-fee-bps',
            'margin_cap': '--margin-cap',
            'account_start_value': '--account-start-value',
            'min_order_notional': '--min-order-notional',
            'rsi_threshold_pairs': '--rsi-threshold-pairs',
        }
        for key, flag in mapping.items():
            val = (payload or {}).get(key, None)
            if val is None or str(val).strip() == '':
                continue
            cmd += [flag, str(val)]

        cmd += extra_flags

        timeout_sec = float((payload or {}).get('timeout_sec') or 600)
        t0 = time.time()
        if progress_cb is None:
            proc = subprocess.run(
                cmd,
                cwd=str(ROOT),
                capture_output=True,
                text=True,
                timeout=timeout_sec,
            )
            dt = time.time() - t0
            returncode = proc.returncode
            stdout_tail = proc.stdout[-20000:]
            stderr_tail = proc.stderr[-20000:]
        else:
            stdout_log = td_path / 'stdout.log'
            stderr_log = td_path / 'stderr.log'
            deadline = t0 + timeout_sec
            with stdout_log.open('w', encoding='utf-8', errors='ignore') as so, stderr_log.open('w', encoding='utf-8', errors='ignore') as se:
                p = subprocess.Popen(
                    cmd,
                    cwd=str(ROOT),
                    stdout=so,
                    stderr=se,
                    text=True,
                )
                last_progress = None
                while True:
                    rc = p.poll()
                    prog = _read_json_file(progress_out)
                    if isinstance(prog, dict) and prog != last_progress:
                        last_progress = dict(prog)
                        try:
                            progress_cb(dict(prog))
                        except Exception:
                            pass
                    if rc is not None:
                        break
                    if time.time() > deadline:
                        try:
                            p.kill()
                        except Exception:
                            pass
                        raise subprocess.TimeoutExpired(cmd=cmd, timeout=timeout_sec)
                    time.sleep(0.35)
            dt = time.time() - t0
            returncode = int(p.returncode or 0)
            try:
                stdout_tail = stdout_log.read_text(encoding='utf-8', errors='ignore')[-20000:]
            except Exception:
                stdout_tail = ''
            try:
                stderr_tail = stderr_log.read_text(encoding='utf-8', errors='ignore')[-20000:]
            except Exception:
                stderr_tail = ''

        summary = {}
        if summary_out.exists():
            try:
                summary = json.loads(summary_out.read_text(encoding='utf-8'))
            except Exception:
                summary = {}
        trades_preview = _read_trades_preview(trades_out)
        trades_all = _read_csv_rows(trades_out)
        try:
            equity_max_points = int((payload or {}).get('equity_max_points') or 5000)
        except Exception:
            equity_max_points = 5000
        equity_curve = _read_equity_curve_json(equity_out, max_points=equity_max_points)

        return {
            'ok': returncode == 0,
            'returncode': returncode,
            'elapsed_sec': round(dt, 3),
            'cmd': cmd,
            'stdout': stdout_tail,
            'stderr': stderr_tail,
            'summary': summary,
            'trades_preview': trades_preview,
            'trades_all': trades_all,
            'equity_curve': equity_curve,
            'run_payload': payload,
        }


def run_backtest(payload: dict) -> dict:
    p = dict(payload or {})
    raw_tfs = p.get('tfs')
    if not isinstance(raw_tfs, list):
        return _run_backtest_single(p)

    tfs = []
    for x in raw_tfs:
        s = str(x or '').strip()
        if not s:
            continue
        if s not in tfs:
            tfs.append(s)
    if not tfs:
        return _run_backtest_single(p)
    if len(tfs) == 1:
        p['tf'] = tfs[0]
        return _run_backtest_single(p)

    batch_results = []
    primary = None
    all_ok = True
    total_elapsed = 0.0
    batch_tf_order_values = _resolve_batch_tf_order_values(p)
    for tf in tfs:
        one = dict(p)
        one['tf'] = tf
        one.pop('tfs', None)
        if str(tf) in batch_tf_order_values:
            one['order_value'] = float(batch_tf_order_values[str(tf)])
        res = _run_backtest_single(one)
        total_elapsed += float(res.get('elapsed_sec') or 0.0)
        all_ok = bool(all_ok and res.get('ok'))
        batch_results.append({
            'tf': tf,
            'order_value_used': one.get('order_value'),
            'ok': bool(res.get('ok')),
            'elapsed_sec': res.get('elapsed_sec'),
            'returncode': res.get('returncode'),
            'summary': dict(res.get('summary') or {}),
            'stderr_tail': str(res.get('stderr') or '')[-500:] if not bool(res.get('ok')) else '',
        })
        if primary is None:
            primary = res

    if primary is None:
        return _run_backtest_single(p)
    out = dict(primary)
    out['ok'] = bool(all_ok)
    out['batch_mode'] = True
    out['batch_results'] = batch_results
    out['selected_tfs'] = list(tfs)
    out['batch_tf_order_values'] = {k: float(v) for k, v in batch_tf_order_values.items()}
    out['elapsed_sec_total_batch'] = round(float(total_elapsed), 3)
    return out


def _job_update(job_id: str, **updates):
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
        if not isinstance(job, dict):
            return
        job.update(updates)
        job['updated_ts'] = time.time()


def _job_thread_runner(job_id: str, payload: dict):
    p = dict(payload or {})
    try:
        raw_tfs = p.get('tfs')
        tfs = []
        if isinstance(raw_tfs, list):
            for x in raw_tfs:
                s = str(x or '').strip()
                if s and s not in tfs:
                    tfs.append(s)
        if not tfs:
            tfs = [str(p.get('tf') or '15m').strip()]
        _job_update(job_id, state='running', progress={'phase': 'batch_init', 'batch_index': 0, 'batch_total': len(tfs), 'selected_tfs': tfs})

        batch_results = []
        primary = None
        all_ok = True
        total_elapsed = 0.0
        batch_tf_order_values = _resolve_batch_tf_order_values(p)
        for idx, tf in enumerate(tfs, start=1):
            one = dict(p)
            one['tf'] = tf
            one.pop('tfs', None)
            if str(tf) in batch_tf_order_values:
                one['order_value'] = float(batch_tf_order_values[str(tf)])

            def _cb(prog):
                d = dict(prog or {})
                d['batch_index'] = int(idx)
                d['batch_total'] = int(len(tfs))
                d['current_tf'] = str(tf)
                _job_update(job_id, state='running', progress=d)

            res = _run_backtest_single(one, progress_cb=_cb)
            total_elapsed += float(res.get('elapsed_sec') or 0.0)
            all_ok = bool(all_ok and res.get('ok'))
            batch_results.append({
                'tf': tf,
                'order_value_used': one.get('order_value'),
                'ok': bool(res.get('ok')),
                'elapsed_sec': res.get('elapsed_sec'),
                'returncode': res.get('returncode'),
                'summary': dict(res.get('summary') or {}),
                'stderr_tail': str(res.get('stderr') or '')[-500:] if not bool(res.get('ok')) else '',
            })
            if primary is None:
                primary = res
        if primary is None:
            primary = {'ok': False, 'error': 'no_results', 'summary': {}, 'trades_preview': [], 'trades_all': [], 'equity_curve': []}
        out = dict(primary)
        out['ok'] = bool(all_ok)
        out['batch_mode'] = True if len(tfs) > 1 else bool(primary.get('batch_mode'))
        out['batch_results'] = batch_results
        out['selected_tfs'] = list(tfs)
        out['batch_tf_order_values'] = {k: float(v) for k, v in batch_tf_order_values.items()}
        out['elapsed_sec_total_batch'] = round(float(total_elapsed), 3)
        try:
            _persist_last_run(p, out, source='run_job', job_id=job_id)
        except Exception as pe:
            print(f'[backtest-ui] last_run persist failed (job {job_id}): {pe}')
        _job_update(job_id, state='done', result=out, progress={'phase': 'done', 'batch_index': len(tfs), 'batch_total': len(tfs)})
    except subprocess.TimeoutExpired as e:
        timeout_result = {
            'ok': False,
            'error': 'timeout',
            'elapsed_sec': None,
            'cmd': list(e.cmd) if getattr(e, 'cmd', None) else None,
            'stdout': (e.stdout or '')[-20000:] if isinstance(e.stdout, str) else '',
            'stderr': (e.stderr or '')[-20000:] if isinstance(e.stderr, str) else '',
        }
        try:
            _persist_last_run(p, timeout_result, source='run_job', job_id=job_id)
        except Exception as pe:
            print(f'[backtest-ui] last_run persist failed (job {job_id} timeout): {pe}')
        _job_update(job_id, state='done', result=timeout_result, progress={'phase': 'error', 'error': 'timeout'})
    except Exception as e:
        err_result = {'ok': False, 'error': str(e)}
        try:
            _persist_last_run(p, err_result, source='run_job', job_id=job_id)
        except Exception as pe:
            print(f'[backtest-ui] last_run persist failed (job {job_id} error): {pe}')
        _job_update(job_id, state='done', result=err_result, progress={'phase': 'error', 'error': str(e)})


def start_run_job(payload: dict) -> dict:
    job_id = uuid.uuid4().hex[:12]
    with _JOBS_LOCK:
        _JOBS[job_id] = {
            'job_id': job_id,
            'state': 'queued',
            'created_ts': time.time(),
            'updated_ts': time.time(),
            'progress': {'phase': 'queued'},
            'result': None,
        }
    th = threading.Thread(target=_job_thread_runner, args=(job_id, dict(payload or {})), daemon=True)
    th.start()
    _job_update(job_id, thread=th)
    return {'ok': True, 'job_id': job_id}


def get_job_status(job_id: str) -> dict:
    with _JOBS_LOCK:
        job = _JOBS.get(str(job_id))
        if not isinstance(job, dict):
            return {'ok': False, 'error': 'job_not_found'}
        out = {
            'ok': True,
            'job_id': str(job_id),
            'state': str(job.get('state') or 'unknown'),
            'created_ts': job.get('created_ts'),
            'updated_ts': job.get('updated_ts'),
            'progress': dict(job.get('progress') or {}),
        }
        if job.get('state') == 'done':
            out['result'] = job.get('result')
        return out


class BacktestUIHandler(SimpleHTTPRequestHandler):
    server_version = 'BacktestUI/1.0'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BACKTESTS_DIR), **kwargs)

    def log_message(self, fmt, *args):
        sys.stdout.write('[backtest-ui] ' + (fmt % args) + '\n')

    def _send_json(self, code: int, payload: dict):
        raw = json.dumps(payload).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _get_session_user(self) -> dict | None:
        session_id = None
        cookies = self.headers.get('Cookie', '')
        for cookie in cookies.split(';'):
            cookie = cookie.strip()
            if cookie.startswith('session_id='):
                session_id = cookie.split('=', 1)[1]
                break
        if not session_id:
            return None
        with _SESSIONS_LOCK:
            sess = _SESSIONS.get(session_id)
            if sess and sess.get('expires', 0) > time.time():
                return sess
            elif sess:
                _SESSIONS.pop(session_id, None)
        return None

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == '/api/auth/config':
            self._send_json(200, {'google_client_id': os.getenv('GOOGLE_CLIENT_ID') or ''})
            return

        if parsed.path == '/api/auth/status':
            user = self._get_session_user()
            if user:
                self._send_json(200, {'ok': True, 'logged_in': True, 'user': {
                    'email': user['email'],
                    'name': user['name'],
                    'picture': user['picture']
                }})
            else:
                self._send_json(200, {'ok': True, 'logged_in': False})
            return

        # Guard other API endpoints
        if parsed.path.startswith('/api/'):
            user = self._get_session_user()
            if not user:
                self._send_json(401, {'ok': False, 'error': 'unauthorized'})
                return

        if parsed.path == '/api/discover':
            self._send_json(200, _discover_files())
            return
        if parsed.path == '/api/last-run':
            data = _read_json_file(LAST_RUN_PATH)
            self._send_json(200 if data is not None else 404, data if data is not None else {'ok': False, 'error': 'last_run_not_found'})
            return
        if parsed.path == '/api/job_status':
            q = parse_qs(parsed.query or '')
            job_id = str((q.get('job_id') or [''])[-1] or '').strip()
            self._send_json(200 if job_id else 400, get_job_status(job_id) if job_id else {'ok': False, 'error': 'missing_job_id'})
            return
        if parsed.path == '/api/candles':
            try:
                q = parse_qs(parsed.query or '')
                payload = {k: (v[-1] if isinstance(v, list) and v else '') for k, v in q.items()}
                if 'tail_only' in payload:
                    payload['tail_only'] = str(payload.get('tail_only')).strip().lower() not in ('0', 'false', 'no')
                self._send_json(200, _candles_for_ui(payload))
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return
        if parsed.path == '/':
            self.path = '/index.html'
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)

        # Parse request body
        try:
            length = int(self.headers.get('Content-Length', '0') or 0)
        except Exception:
            length = 0

        try:
            body = self.rfile.read(max(0, length)) if length > 0 else b'{}'
            payload = json.loads(body.decode('utf-8') or '{}')
        except Exception as e:
            self._send_json(400, {'ok': False, 'error': f'JSON decode error: {e}'})
            return

        if parsed.path == '/api/auth/google':
            id_token = payload.get('id_token')
            client_id = payload.get('client_id') or os.getenv('GOOGLE_CLIENT_ID')
            if not id_token:
                self._send_json(400, {'ok': False, 'error': 'missing_id_token'})
                return
            user_info = _verify_google_token(id_token, client_id)
            if user_info:
                sess_id = uuid.uuid4().hex
                email = user_info.get('email')
                name = user_info.get('name') or email.split('@')[0]
                picture = user_info.get('picture') or ''
                with _SESSIONS_LOCK:
                    _SESSIONS[sess_id] = {
                        'email': email,
                        'name': name,
                        'picture': picture,
                        'expires': time.time() + 86400 * 7
                    }
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Set-Cookie', f'session_id={sess_id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': True, 'user': {'email': email, 'name': name, 'picture': picture}}).encode('utf-8'))
            else:
                self._send_json(400, {'ok': False, 'error': 'invalid_token'})
            return

        if parsed.path == '/api/auth/logout':
            session_id = None
            cookies = self.headers.get('Cookie', '')
            for cookie in cookies.split(';'):
                cookie = cookie.strip()
                if cookie.startswith('session_id='):
                    session_id = cookie.split('=', 1)[1]
                    break
            if session_id:
                with _SESSIONS_LOCK:
                    _SESSIONS.pop(session_id, None)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Set-Cookie', 'session_id=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True}).encode('utf-8'))
            return

        # Guard other POST endpoints
        if parsed.path.startswith('/api/'):
            user = self._get_session_user()
            if not user:
                self._send_json(401, {'ok': False, 'error': 'unauthorized'})
                return

        if parsed.path not in ('/api/run', '/api/run_job', '/api/candles'):
            self._send_json(404, {'ok': False, 'error': 'not_found'})
            return

        try:
            if not isinstance(payload, dict):
                raise ValueError('JSON body must be an object')
            if parsed.path == '/api/candles':
                result = _candles_for_ui(payload)
            elif parsed.path == '/api/run_job':
                result = start_run_job(payload)
            else:
                result = run_backtest(payload)
                try:
                    _persist_last_run(payload, result, source='run')
                except Exception as pe:
                    print(f'[backtest-ui] last_run persist failed (sync run): {pe}')
            self._send_json(200, result)
        except subprocess.TimeoutExpired as e:
            timeout_result = {
                'ok': False,
                'error': 'timeout',
                'elapsed_sec': None,
                'cmd': list(e.cmd) if getattr(e, 'cmd', None) else None,
                'stdout': (e.stdout or '')[-20000:] if isinstance(e.stdout, str) else '',
                'stderr': (e.stderr or '')[-20000:] if isinstance(e.stderr, str) else '',
            }
            if parsed.path == '/api/run':
                try:
                    _persist_last_run(payload if 'payload' in locals() else {}, timeout_result, source='run')
                except Exception as pe:
                    print(f'[backtest-ui] last_run persist failed (sync timeout): {pe}')
            self._send_json(200, timeout_result)
        except Exception as e:
            self._send_json(400, {'ok': False, 'error': str(e)})


def main():
    ap = argparse.ArgumentParser(description='Local web UI for local_rsi_backtest.py')
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--port', type=int, default=8091)
    args = ap.parse_args()

    if not HTML_PATH.exists():
        raise SystemExit(f'Missing UI file: {HTML_PATH}')

    httpd = ThreadingHTTPServer((args.host, args.port), BacktestUIHandler)
    print(f'Backtest UI running at http://{args.host}:{args.port}/')
    print(f'Root={ROOT}')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == '__main__':
    main()
