import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');

const app = express();
const PORT = Number(process.env.COMMAND_CENTER_PORT || 3010);

app.get('/', (_req, res) => {
  res.redirect(302, '/command-center');
});

app.use('/assets', express.static(path.join(distDir, 'assets')));
app.use(express.static(distDir));

app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`command-center-redirect listening on http://0.0.0.0:${PORT}`);
});
