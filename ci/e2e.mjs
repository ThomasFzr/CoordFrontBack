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
  const tab = { target, errors: [] };
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
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
    // Diagnostic : ce que la page affiche au moment de l'échec.
    const seen = await tab.eval(`JSON.stringify({ statut: document.querySelector('#status')?.textContent,
      live: document.querySelector('#live')?.textContent,
      cartes: [...document.querySelectorAll('#list .card-place')].slice(0, 4).map((e) => e.textContent) })`).catch(() => '?');
    throw new Error(`délai dépassé : ${label} — page : ${seen}`);
  };
  // Le marqueur posé sur l'ancien document disparaît avec lui : on attend le document réellement chargé.
  tab.goto = async (u) => {
    await tab.eval(`window.__ancienDocument = true`).catch(() => {});
    const reply = await tab.send('Page.navigate', { url: u });
    const failure = reply.error?.message ?? reply.result?.errorText;
    if (failure) throw new Error(`navigation vers ${u} impossible : ${failure}`);
    await tab.waitFor('page chargée', `!window.__ancienDocument && document.readyState === 'complete' && !!document.querySelector('#live')`);
  };
  tab.close = () => fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`).then((r) => r.text());
  await tab.send('Runtime.enable');
  await tab.send('Page.enable');
  // Compte les EventSource créés par chaque document, avant tout script de la page. Une reconnexion
  // automatique du navigateur réutilise l'objet ; un second connect() ou une boucle de recréation l'incrémente.
  await tab.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__fluxCrees = 0;
      window.EventSource = class extends window.EventSource {
        constructor(...args) { super(...args); window.__fluxCrees++; }
      };`,
  });
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

  // Recherche réactive : frappe lettre par lettre, sans valider ; un champ autre que le nom (la ville).
  await B.eval(`(() => { const q = document.querySelector('#filters').q; q.value = ''; q.dispatchEvent(new Event('input')); return true; })()`);
  await B.eval(`(async () => {
    const q = document.querySelector('#filters').q;
    for (const char of 'barcelona') { q.value += char; q.dispatchEvent(new Event('input')); await new Promise((r) => setTimeout(r, 60)); }
    return true;
  })()`);
  await B.waitFor('résultats de la recherche réactive', `(() => {
    const places = [...document.querySelectorAll('#list .card-place')].map((e) => e.textContent);
    return document.querySelector('#status').textContent.startsWith('11 annonces') && places.length > 0 && places.every((p) => p.includes('Barcelona'));
  })()`);
  ok('recherche réactive : résultats à la frappe, sans valider, sur la ville (Barcelona)');

  // Espaces et ponctuation ajoutés en fin de saisie : même recherche normalisée, aucune requête envoyée.
  const searches = `performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/listings?')).length`;
  const sent = await B.eval(searches);
  await B.eval(`(async () => {
    const q = document.querySelector('#filters').q;
    for (const char of '  , ') { q.value += char; q.dispatchEvent(new Event('input')); await new Promise((r) => setTimeout(r, 60)); }
    q.value = q.value.toUpperCase(); q.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 600));
    return true;
  })()`);
  const after = await B.eval(searches);
  if (after !== sent) throw new Error(`${after - sent} requête(s) envoyée(s) pour une recherche inchangée`);
  ok('recherche normalisée : espaces, virgule et majuscules en plus n’envoient aucune requête');
  await B.eval(search('Annonce de test'));

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

  // CRUD : création, modification visible en direct, conflit d'édition, suppression.
  const name = `E2E CRUD ${Date.now()}`;
  const fill = (values) => `(() => {
    const form = document.querySelector('.edit-form');
    for (const [k, v] of Object.entries(${JSON.stringify('__VALUES__')})) form.elements[k].value = v;
    form.requestSubmit();
    return true;
  })()`;
  const fillWith = (values) => fill().replace(JSON.stringify('__VALUES__'), JSON.stringify(values));
  const message = (text) => `document.querySelector('.message')?.textContent.startsWith(${JSON.stringify(text)})`;
  const priceOf = (n) => `[...document.querySelectorAll('#list li')].some((li) => li.querySelector('.card-title').textContent === ${JSON.stringify(name)} && li.textContent.includes('${n} $ / nuit'))`;

  await C.eval(search(name));
  await C.waitFor('C filtré sur le CRUD', `document.querySelector('#status').dataset.state === 'success'`);
  await A.eval(`document.querySelector('#detail').close(); document.querySelector('#add-listing').click()`);
  await A.waitFor('formulaire de création', `!!document.querySelector('.edit-form')`);
  await A.eval(fillWith({ name, price: '120', 'address.market': 'Lyon', 'address.country': 'France' }));
  await A.waitFor('création confirmée', message('Annonce créée.'));
  await C.waitFor('C voit la nouvelle annonce', priceOf(120));
  ok('CRUD : annonce créée dans A par le formulaire → visible dans C');

  await A.eval(`[...document.querySelectorAll('.actions button')].find((b) => b.textContent === 'Modifier').click()`);
  await A.eval(fillWith({ price: '150' }));
  await A.waitFor('modification confirmée', message('Modifications enregistrées.'));
  await C.waitFor('C voit le nouveau prix', priceOf(150));
  ok('CRUD : prix modifié dans A → mis à jour dans C');

  // Conflit : C ouvre le formulaire, A enregistre avant lui.
  await C.eval(`[...document.querySelectorAll('#list li')].find((li) => li.querySelector('.card-title').textContent === ${JSON.stringify(name)}).querySelector('.card').click()`);
  await C.waitFor('fiche C', `!!document.querySelector('.actions button')`);
  await C.eval(`[...document.querySelectorAll('.actions button')].find((b) => b.textContent === 'Modifier').click()`);
  await A.eval(`[...document.querySelectorAll('.actions button')].find((b) => b.textContent === 'Modifier').click()`);
  await A.eval(fillWith({ price: '175' }));
  await A.waitFor('A enregistre', message('Modifications enregistrées.'));
  await C.eval(fillWith({ price: '160' }));
  await C.waitFor('conflit signalé à C', message('Cette annonce a été modifiée ailleurs'));
  await C.eval(`[...document.querySelectorAll('.edit-form button')].find((b) => b.textContent === 'Annuler').click()`);
  await C.waitFor('C relit la version actuelle', `[...document.querySelectorAll('.facts dd')].some((dd) => dd.textContent === '175 $ / nuit')`);
  ok('CRUD : édition concurrente refusée (409) dans C, qui relit la version de A');

  await A.eval(`[...document.querySelectorAll('.actions button')].find((b) => b.textContent === 'Supprimer').click()`);
  await A.eval(`[...document.querySelectorAll('.actions button')].find((b) => b.textContent === 'Confirmer la suppression').click()`);
  await A.waitFor('suppression dans A', `document.querySelector('#detail-body').textContent === 'Annonce supprimée.'`);
  await C.waitFor('C voit la suppression', `document.querySelector('#detail-body').textContent === 'Cette annonce n’existe plus.' && !(${priceOf(175)})`);
  ok('CRUD : suppression confirmée dans A → fiche et carte retirées dans C');

  // Recharger plusieurs fois : chaque page quittée doit fermer son flux, la page affichée n'en ouvre qu'un.
  // Le serveur compte ses abonnés : A et C sont ouverts (B est fermé), donc 2 abonnés, pas un de plus.
  const subscribers = async () => (await (await fetch(`${FRONT}/api/events/stats`)).json()).clients;
  for (let i = 0; i < 3; i++) await C.goto(url);
  await C.waitFor('C reconnecté', live);
  const end = Date.now() + 8000;
  while ((await subscribers()) !== 2 && Date.now() < end) await sleep(250);
  // Laisser à une éventuelle boucle de reconnexion le temps de se manifester.
  await sleep(3000);
  const [created, count] = [await C.eval(`window.__fluxCrees`), await subscribers()];
  if (created !== 1) throw new Error(`la page affichée a créé ${created} EventSource (1 attendu)`);
  if (count !== 2) throw new Error(`${count} abonnés côté serveur après 3 rechargements de C (2 attendus : A et C)`);
  ok('après 3 rechargements : un seul EventSource créé par la page, et le serveur ne compte que les onglets ouverts');

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
