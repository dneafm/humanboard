const fs = require('fs');
const path = 'F:\\backtest\\djtrade v3\\_zip_inspect\\backend-data\\backend-state.json';

const data = JSON.parse(fs.readFileSync(path, 'utf8'));
console.log('Root keys:', Object.keys(data));
console.log('workerEfficiency type:', typeof data.workerEfficiency);
if (data.workerEfficiency) {
  console.log('workerEfficiency keys:', Object.keys(data.workerEfficiency));
  console.log('workerEfficiency sample:', JSON.stringify(Object.entries(data.workerEfficiency).slice(0, 2), null, 2));
}
console.log('workerOutcomeSamples type:', typeof data.workerOutcomeSamples);
if (Array.isArray(data.workerOutcomeSamples)) {
  console.log('workerOutcomeSamples count:', data.workerOutcomeSamples.length);
  console.log('workerOutcomeSamples sample:', JSON.stringify(data.workerOutcomeSamples.slice(0, 2), null, 2));
}
