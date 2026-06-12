const fs = require('fs');
const path = 'F:\\backtest\\djtrade v3\\_zip_inspect\\backend-data\\backend-state.json';

if (!fs.existsSync(path)) {
  console.error(`Error: State file not found at ${path}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(path, 'utf8'));

console.log('=== WORKER PERFORMANCE LEADERBOARD (Worst to Best Realized PnL) ===');
const workers = Object.values(data.workerEfficiency || {}).sort((a, b) => {
  const pnlA = Number(a.realizedPnl ?? a.mockRealizedPnl ?? 0);
  const pnlB = Number(b.realizedPnl ?? b.mockRealizedPnl ?? 0);
  return pnlA - pnlB;
});

workers.forEach(w => {
  const pnl = Number(w.realizedPnl ?? w.mockRealizedPnl ?? 0);
  const hypPnl = Number(w.hypotheticalPnlPer100 ?? 0);
  const trades = Number(w.mockClosedTrades ?? w.attributedTrades ?? 0);
  const wins = Number(w.mockWins ?? w.wins ?? 0);
  const losses = Number(w.mockLosses ?? w.losses ?? 0);
  const acc = Number(w.accuracyPct ?? 0);
  console.log(`[${w.role.toUpperCase()}] ${w.name.padEnd(25)} | Realized PnL: $${pnl.toFixed(2).padStart(8)} | Hyp PnL: ${hypPnl.toFixed(2).padStart(6)} | Win/Loss: ${wins}W/${losses}L | Acc: ${acc.toFixed(1)}%`);
});

console.log('\n=== TOP 20 BIGGEST LOSS-MAKING WORKER DECISIONS ===');
const samples = (data.workerOutcomeSamples || [])
  .filter(s => s.status === 'resolved' && (Number(s.returnBps ?? 0) < 0 || s.correct === false))
  .sort((a, b) => Number(a.returnBps ?? 0) - Number(b.returnBps ?? 0));

if (samples.length === 0) {
  console.log('No loss-making decisions found.');
} else {
  samples.slice(0, 20).forEach((s, idx) => {
    const returnBps = Number(s.returnBps ?? 0);
    const pnl = Number(s.hypotheticalPnlPer100 ?? 0);
    console.log(`${(idx + 1).toString().padStart(2)}. Worker: ${s.name} (${s.role})`);
    console.log(`    Symbol: ${s.symbol.padEnd(10)} | Side: ${s.side.padEnd(5)} | Event: ${s.eventType}`);
    console.log(`    Return: ${returnBps.toFixed(1).padStart(6)} bps | Hyp PnL: $${pnl.toFixed(2).padStart(6)}`);
    console.log(`    Entry Mark: $${(s.entryMark ?? 0).toFixed(4)} | Exit Mark: $${(s.exitMark ?? 0).toFixed(4)}`);
    console.log(`    Captured At: ${s.capturedAt ? new Date(s.capturedAt).toLocaleString() : 'N/A'}`);
    console.log('-'.repeat(60));
  });
}
