import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const STATE_FILE = join(__dirname, 'state.json');

const defaultState = {
  parentPin: '1234',
  children: [],
  tasks: [],
  completions: [],
  rewards: [],
  rewardClaims: [],
  manualPenalties: [],
};

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return { ...defaultState, ...JSON.parse(readFileSync(STATE_FILE, 'utf8')) };
    }
  } catch {}
  return defaultState;
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(join(__dirname, 'dist')));

app.get('/api/state', (_req, res) => {
  res.json(loadState());
});

app.put('/api/state', (req, res) => {
  try {
    saveState(req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Family Tasks running on http://localhost:${PORT}`);
});
