// Test navigateur du TP SSE : plusieurs onglets réels (Chrome headless piloté par CDP).
// Usage : node ci/e2e.mjs http://localhost:8080   (CHROME, API_CONTAINER=ci-api pour surcharger)
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FRONT = process.argv[2] ?? 'http://localhost:8080';
const API_CONTAINER = process.env.API_CONTAINER ?? 'ci-api';
const CHROME =
  process.env.CHROME ??
  (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const PORT = 9300 + Math.floor(Math.random() * 500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'e2e-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--no-sandbox',
  '--disable-gpu', '--disable-dev-shm-usage', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeLog = '';
chrome.stderr.on('data', (chunk) => { chromeLog = (chromeLog + chunk).slice(-2000); });
chrome.on('error', (error) => { chromeLog += `\nlancement impossible : ${error.message}`; });

let failed = false;
const ok = (msg) => console.log(`✓ ${msg}`);
async function cleanup() {
  const exited = new Promise((r) => chrome.once('exit', r));
  chrome.kill();
  await Promise.race([exited, sleep(5000)]);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Profil temporaire : le système le nettoiera.
  }
}

async function cdp(path, method = 'GET') {
  const end = Date.now() + 30_000;
  let last;
  while (Date.now() < end) {
    if (chrome.exitCode !== null) break;
    try {
      return await (await fetch(`http://127.0.0.1:${PORT}${path}`, { method })).json();
    } catch (error) {
      last = error;
      await sleep(300);
    }
  }
  const log = chromeLog.trim().split('\n').slice(-5).join(' | ');
  throw new Error(`Chrome injoignable (${CHROME}, code ${chrome.exitCode}, ${last?.message ?? '-'}) ${log}`);
}

// Un onglet : navigation, évaluation de JS dans la page, journal réseau des EventSource.
async function openTab(url) {
  const target = await cdp(`/json/new?${encodeURI('about:blank')}`, 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  const tab = { target, eventSources: 0, errors: [] };
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Network.requestWillBeSent' && m.params.type === 'EventSource') tab.eventSources++;
    if (m.method === 'Runtime.exceptionThrown') tab.errors.push(m.params.exceptionDetails.exception?.description);
  };
  tab.send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  tab.eval = async (expression) => {
    const { result } = await tab.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'évaluation');
    return result.result.value;
  };
  tab.waitFor = async (label, expression, timeout = 10_000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try { if (await tab.eval(expression)) return; } catch {}
      await sleep(150);
    }
    throw new Error(`délai dépassé : ${label}`);
  };
  tab.goto = async (u) => {
    tab.eventSources = 0;
    await tab.send('Page.navigate', { url: u });
    await tab.waitFor('page chargée', `document.readyState === 'complete' && !!document.querySelector('#live')`);
  };
  tab.close = () => fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`).then((r) => r.text());
  await tab.send('Network.enable');
  await tab.send('Runtime.enable');
  await tab.send('Page.enable');
  await tab.goto(url);
  return tab;
}

const live = `document.querySelector('#live').dataset.state === 'on'`;
const search = (q) => `(() => { const f = document.querySelector('#filters'); f.q.value = ${JSON.stringify(q)}; f.requestSubmit(); return true; })()`;
const cardTitles = `[...document.querySelectorAll('.card-title')].map((e) => e.textContent)`;
const cardBooked = (id) => `!!document.querySelector('#list li[data-id="${id}"] .badge')`;

try {
  // Polling désactivé : seule la synchronisation SSE peut faire changer B.
  const url = `${FRONT}/?poll=0`;
  const A = await openTab(url);
  const B = await openTab(url);
  await A.waitFor('A connecté', live);
  await B.waitFor('B connecté', live);
  ok('deux onglets connectés au flux (polling désactivé)');

  // Marqueur en mémoire : s'il survit, B n'a jamais rechargé la page.
  await B.eval(`window.__sansNavigation = true`);
  await B.eval(search('Annonce de test'));
  await B.waitFor('B filtré', `document.querySelector('#status').dataset.state === 'success'`);
  const before = (await B.eval(cardTitles)).length;

  await A.eval(`document.querySelector('#add-test').click()`);
  await B.waitFor('annonce créée visible dans B', `${cardTitles}.length === ${before + 1}`);
  const id = await B.eval(`document.querySelector('#list li:last-child').dataset.id`);
  ok(`annonce créée dans A → visible dans B sans navigation (${id})`);

  // B regarde la fiche pendant que A réserve.
  await B.eval(`document.querySelector('#list li[data-id="${id}"] .card').click()`);
  await B.waitFor('fiche B disponible', `document.querySelector('.availability')?.textContent === 'Disponible'`);

  await A.eval(search('Annonce de test'));
  await A.waitFor('A filtré', `!!document.querySelector('#list li[data-id="${id}"]')`);
  await A.eval(`document.querySelector('#list li[data-id="${id}"] .card').click()`);
  await A.waitFor('bouton Réserver', `document.querySelector('.actions .primary')?.textContent === 'Réserver'`);
  await A.eval(`document.querySelector('.actions .primary').click()`);
  await A.waitFor('confirmation personnelle dans A', `document.querySelector('.message')?.textContent === 'Votre réservation est confirmée.'`);
  ok('A reçoit la confirmation de son POST (201)');

  await B.waitFor('fiche B réservée', `document.querySelector('.availability')?.textContent === 'Réservé' && document.querySelector('.actions .primary').disabled`);
  await B.waitFor('carte B réservée', cardBooked(id));
  if (await B.eval(`!!document.querySelector('.message')`)) throw new Error('B affiche une confirmation personnelle');
  if (await B.eval(`[...document.querySelectorAll('.actions button')].some((b) => b.textContent === 'Annuler la réservation')`)) {
    throw new Error('B peut annuler la réservation de A');
  }
  if (!(await A.eval(`[...document.querySelectorAll('.actions button')].some((b) => b.textContent === 'Annuler la réservation')`))) {
    throw new Error('A ne peut pas annuler sa propre réservation');
  }
  if (!(await B.eval(`window.__sansNavigation === true`))) throw new Error('B a rechargé la page');
  ok('B voit « Réservé » et « Indisponible » sans navigation, sans confirmation ni bouton Annuler ; A peut annuler');

  // Un nouvel onglet obtient l'état courant à sa connexion.
  const C = await openTab(url);
  await C.waitFor('C connecté', live);
  await C.eval(search('Annonce de test'));
  await C.waitFor('C voit la réservation', cardBooked(id));
  ok('un troisième onglet obtient immédiatement l’état courant');

  // Fermer un abonné ne change pas la règle métier.
  await B.close();
  await A.eval(`[...document.querySelectorAll('.actions button')].find((b) => b.textContent === 'Annuler la réservation').click()`);
  await A.waitFor('annulation dans A', `document.querySelector('.message')?.textContent === 'Réservation annulée.'`);
  await C.waitFor('C voit la libération', `!${cardBooked(id)}`);
  ok('B fermé : l’action de A reste acceptée et C est actualisé');

  // Recharger plusieurs fois : une seule connexion SSE par chargement de page.
  for (let i = 0; i < 3; i++) await C.goto(url);
  await C.waitFor('C reconnecté', live);
  await sleep(1000);
  if (C.eventSources !== 1) throw new Error(`${C.eventSources} connexions SSE après rechargement (1 attendue)`);
  ok('après plusieurs rechargements, une seule connexion SSE dans l’onglet');

  // Coupure réelle : redémarrage de l'API, puis reconnexion et relecture.
  await C.eval(search('Annonce de test'));
  await C.waitFor('C filtré', `!!document.querySelector('#list li[data-id="${id}"]')`);
  execFileSync('docker', ['restart', '-t', '1', API_CONTAINER], { stdio: 'ignore' });
  await C.waitFor('C signale la coupure', `document.querySelector('#live').textContent === 'Connexion interrompue…'`, 15_000);
  await C.waitFor('C reconnecté après redémarrage', live, 30_000);
  const r = await fetch(`${FRONT}/api/listings/${id}/reservations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId: 'e2e' }),
  });
  if (r.status !== 201) throw new Error(`réservation après redémarrage : HTTP ${r.status}`);
  await C.waitFor('C actualisé après reconnexion', cardBooked(id));
  ok('redémarrage de l’API : coupure affichée, reconnexion, données conservées et actualisées');

  for (const tab of [A, C]) if (tab.errors.length) throw new Error(`erreurs JS : ${tab.errors.join(' | ')}`);
} catch (error) {
  failed = true;
  console.log(`✗ navigateur : ${error.message}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=e2e::${error.message}`);
} finally {
  await cleanup();
}
process.exit(failed ? 1 : 0);
