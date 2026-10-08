import { renderCards, renderDetail, renderForm, validateListing, validatePage } from './view.js';

// Même origine : nginx relaie /api vers l'API (pas de CORS, pas de port en dur).
const API_URL = '/api';
const LIMIT = 12;
// Relecture de secours (ms). ?poll=0 la désactive pour vérifier SSE seul, sans qu'elle masque un défaut.
const POLL_MS = Number(new URLSearchParams(location.search).get('poll') ?? 30_000);
// Identité fictive de cet onglet (sessionStorage : propre à chaque onglet, conservée au rechargement).
// Elle sert à la démonstration, pas à une authentification.
const session = {
  get(key, fallback) {
    try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible : mémoire seule */ }
  },
};
const CUSTOMER_ID = session.get('customerId', null) ?? `onglet-${Math.random().toString(36).slice(2, 8)}`;
session.set('customerId', CUSTOMER_ID);
// Réservations faites depuis cet onglet : seul cet onglet propose de les annuler (l'API le vérifie aussi).
const mine = new Set(session.get('reservations', []));
const saveMine = () => session.set('reservations', [...mine]);

const form = document.querySelector('#filters');
const list = document.querySelector('#list');
const status = document.querySelector('#status');
const prev = document.querySelector('#prev');
const next = document.querySelector('#next');
const pageInfo = document.querySelector('#page-info');
const dialog = document.querySelector('#detail');
const detailBody = document.querySelector('#detail-body');
const live = document.querySelector('#live');
const toasts = document.querySelector('#toasts');
const addTest = document.querySelector('#add-test');
const addListing = document.querySelector('#add-listing');

let page = 1;
let pages = 1;
let openId = null;      // annonce affichée dans la fiche
let current = null;     // dernière version lue de cette annonce (sa version sert à If-Match)
let mode = 'detail';    // detail | edit | create : un formulaire en cours n'est jamais écrasé par une relecture
let confirmDelete = false;
let detailMessage = ''; // message personnel : seulement dans l'onglet qui a agi

async function getJson(path) {
  const response = await fetch(`${API_URL}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (response.status === 404) throw new Error('Cette annonce n’existe plus.');
  if (!response.ok) throw new Error(`La récupération a échoué (HTTP ${response.status}).`);
  return response.json();
}

function setStatus(state, text) {
  status.dataset.state = state;
  status.textContent = text;
}

function setLive(state, text) {
  live.dataset.state = state;
  live.textContent = text;
}

function toast(text, action) {
  const item = document.createElement('div');
  item.className = 'toast';
  item.textContent = text;
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.addEventListener('click', () => { action.run(); item.remove(); });
    item.append(button);
  }
  toasts.append(item);
  setTimeout(() => item.remove(), 6000);
}

// --- Relecture sérialisée : une seule lecture à la fois, la dernière demande gagne ---
let running = false;
let dirty = false;
let stopped = false;

async function reload() {
  if (stopped) return;
  dirty = true;
  if (running) return;
  running = true;
  try {
    while (dirty && !stopped) {
      dirty = false;
      const params = new URLSearchParams({ page, limit: LIMIT });
      for (const [key, value] of new FormData(form)) if (value.trim()) params.set(key, value.trim());
      const payload = validatePage(await getJson(`/listings?${params}`));
      if (stopped) return;
      pages = Math.max(1, payload.pages);
      renderCards(payload.data, list, openDetail);
      const time = new Date().toLocaleTimeString('fr-FR');
      setStatus('success', payload.total ? `${payload.total} annonces · actualisé à ${time}` : 'Aucune annonce ne correspond à ces filtres.');
    }
  } catch (error) {
    setStatus('error', `Actualisation impossible. ${error.message}`);
  } finally {
    running = false;
    pageInfo.textContent = `Page ${page} / ${pages}`;
    prev.disabled = page <= 1;
    next.disabled = page >= pages;
  }
}

// Action de l'utilisateur (filtre, page) : on vide la liste pour ne pas montrer d'anciennes données.
function loadListings() {
  list.replaceChildren();
  prev.disabled = next.disabled = true;
  setStatus('loading', 'Chargement des annonces…');
  reload();
}

// --- Fiche détail ---
function showDetail() {
  renderDetail(current, detailBody, {
    message: detailMessage,
    mine: mine.has(current._id),
    confirmDelete,
    onReserve: reserve,
    onRelease: release,
    onEdit: () => { mode = 'edit'; detailMessage = ''; showForm(); },
    onAskDelete: (ask) => { confirmDelete = ask; showDetail(); },
    onDelete: removeListing,
  });
}

async function refreshDetail() {
  if (!openId || mode !== 'detail') return;
  const id = openId;
  try {
    const listing = validateListing(await getJson(`/listings/${encodeURIComponent(id)}`));
    if (listing.status !== 'BOOKED' && mine.delete(id)) saveMine();
    if (openId === id && mode === 'detail') {
      current = listing;
      showDetail();
    }
  } catch (error) {
    if (openId === id && mode === 'detail') detailBody.textContent = error.message;
  }
}

function openDetail(id) {
  openId = id;
  current = null;
  mode = 'detail';
  confirmDelete = false;
  detailMessage = '';
  detailBody.textContent = 'Chargement…';
  if (!dialog.open) dialog.showModal();
  refreshDetail();
}

dialog.addEventListener('close', () => { openId = null; current = null; mode = 'detail'; });

// --- CRUD ---
function showForm(message = '') {
  renderForm(mode === 'edit' ? current : null, detailBody, {
    message,
    onSubmit: mode === 'edit' ? saveEdit : saveNew,
    onCancel: () => {
      if (mode === 'create') return dialog.close();
      mode = 'detail';
      refreshDetail();
    },
  });
}

function openCreate() {
  openId = null;
  current = null;
  mode = 'create';
  if (!dialog.open) dialog.showModal();
  showForm();
}

const send = (method, path, body, version) =>
  fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      // Version lue par cet onglet : l'API refuse (409) si l'annonce a changé entre-temps.
      ...(version !== undefined ? { 'If-Match': String(version ?? 'none') } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);

const errorText = async (response) => (await response?.json().catch(() => null))?.error ?? '';

async function saveNew(values) {
  const response = await send('POST', '/listings', values);
  if (response?.status === 201) {
    const created = await response.json();
    detailMessage = 'Annonce créée.';
    mode = 'detail';
    openId = created._id;
    refreshDetail();
    reload();
  } else {
    showForm(response ? `Création refusée (HTTP ${response.status}). ${await errorText(response)}` : 'Création impossible : API injoignable.');
  }
}

async function saveEdit(changes) {
  if (Object.keys(changes).length === 0) {
    mode = 'detail';
    detailMessage = 'Aucune modification.';
    return refreshDetail();
  }
  const response = await send('PATCH', `/listings/${encodeURIComponent(current._id)}`, changes, current.version);
  if (response?.status === 200) {
    detailMessage = 'Modifications enregistrées.';
    mode = 'detail';
    refreshDetail();
    reload();
  } else if (response?.status === 409) {
    showForm('Cette annonce a été modifiée ailleurs entre-temps : annulez pour relire la version actuelle, puis recommencez.');
  } else if (response?.status === 404) {
    mode = 'detail';
    detailBody.textContent = 'Cette annonce n’existe plus.';
  } else {
    showForm(response ? `Enregistrement refusé (HTTP ${response.status}). ${await errorText(response)}` : 'Résultat incertain : relisez l’annonce avant de réessayer.');
  }
}

async function removeListing() {
  const response = await send('DELETE', `/listings/${encodeURIComponent(current._id)}`, null, current.version);
  confirmDelete = false;
  if (response?.status === 204) {
    const name = current.name;
    openId = null;
    detailBody.textContent = 'Annonce supprimée.';
    toast(`« ${name || 'Annonce sans titre'} » supprimée`);
    reload();
  } else {
    detailMessage = response?.status === 409
      ? 'Cette annonce a été modifiée ailleurs entre-temps : vérifiez-la avant de la supprimer.'
      : 'Suppression impossible.';
    refreshDetail();
  }
}

// Seule la réponse du POST personnel confirme la réservation ; le flux SSE n'informe que de la disponibilité.
async function reserve(id) {
  try {
    const response = await fetch(`${API_URL}/listings/${encodeURIComponent(id)}/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: CUSTOMER_ID }),
    });
    if (response.status === 201) { mine.add(id); saveMine(); }
    detailMessage = {
      201: 'Votre réservation est confirmée.',
      409: 'Cette annonce vient d’être réservée. Choisissez-en une autre.',
      404: 'Cette annonce n’existe plus.',
    }[response.status] ?? `Réservation refusée (HTTP ${response.status}).`;
  } catch {
    // La requête a pu être enregistrée avant la perte de la réponse : on relit avant de réessayer.
    detailMessage = 'Résultat incertain : vérifiez l’état de l’annonce avant de réessayer.';
  }
  await refreshDetail();
  reload();
}

async function release(id) {
  const response = await fetch(`${API_URL}/listings/${encodeURIComponent(id)}/reservations`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId: CUSTOMER_ID }),
  }).catch(() => null);
  if (response?.status === 204) { mine.delete(id); saveMine(); }
  detailMessage = {
    204: 'Réservation annulée.',
    403: 'Cette réservation a été faite par quelqu’un d’autre.',
    404: 'Il n’y a plus de réservation sur cette annonce.',
  }[response?.status] ?? 'Annulation impossible.';
  await refreshDetail();
  reload();
}

// Données fictives uniquement : les actions du TP ne touchent jamais les vraies annonces.
async function createTestListing() {
  const id = `test-${Date.now().toString(36)}`;
  const name = `Annonce de test ${new Date().toLocaleTimeString('fr-FR')}`;
  const response = await fetch(`${API_URL}/listings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      _id: id,
      name,
      summary: 'Annonce fictive créée pour tester la synchronisation SSE.',
      property_type: 'Apartment',
      room_type: 'Entire home/apt',
      accommodates: 2,
      bedrooms: 1,
      beds: 1,
      price: 99,
      address: { market: 'Test', country: 'Test' },
    }),
  }).catch(() => null);
  if (response?.status === 201) {
    toast(`${name} créée`, { label: 'Voir', run: () => openDetail(id) });
    reload();
  } else {
    toast('Création impossible.');
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  page = 1;
  loadListings();
});
for (const select of form.querySelectorAll('select')) select.addEventListener('change', () => form.requestSubmit());
prev.addEventListener('click', () => { page -= 1; loadListings(); });
next.addEventListener('click', () => { page += 1; loadListings(); });
dialog.querySelector('.close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
addTest.addEventListener('click', createTestListing);
addListing.addEventListener('click', openCreate);

// --- Temps réel : un seul flux par onglet ---
let stream;
let timer;

function connect() {
  stream = new EventSource(`${API_URL}/events`);
  // ready arrive à chaque (re)connexion : relire rattrape ce qui a changé pendant une coupure.
  stream.addEventListener('ready', () => {
    setLive('on', 'En direct');
    reload();
  });
  stream.addEventListener('listing-updated', (event) => {
    reload();
    try {
      const change = JSON.parse(event.data);
      if (change.listingId === openId) refreshDetail();
    } catch {
      console.warn('Événement SSE illisible :', event.data);
    }
  });
  stream.onerror = () => {
    setLive('off', 'Connexion interrompue…');
    // Coupure réseau : EventSource se reconnecte seul, on ne ferme rien.
    // Réponse non-SSE (ex. 502 de nginx pendant un redémarrage de l'API) : le navigateur abandonne
    // définitivement (CLOSED), on recrée donc le flux nous-mêmes.
    if (stream.readyState === EventSource.CLOSED) {
      setTimeout(() => { if (!stopped && stream.readyState === EventSource.CLOSED) connect(); }, 2000);
    }
  };
}

function start() {
  stopped = false;
  connect();
  if (POLL_MS > 0) timer = setInterval(reload, POLL_MS);
}

function stop() {
  stopped = true;
  stream?.close();
  clearInterval(timer);
}

// Démontage : l'onglet est fermé ou quitté ; s'il revient du cache de navigation, on se réabonne.
window.addEventListener('pagehide', stop);
window.addEventListener('pageshow', (event) => { if (event.persisted) start(); });

loadListings();
start();
