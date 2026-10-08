import { renderCard, renderCards, renderDetail, validateListing, validatePage } from './view.js';

const API_URL = `${location.protocol}//${location.hostname}:3000`;
const LIMIT = 12;

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

let page = 1;
let pages = 1;

async function getJson(path) {
  const response = await fetch(`${API_URL}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`La récupération a échoué (HTTP ${response.status}).`);
  return response.json();
}

function setStatus(state, text) {
  status.dataset.state = state;
  status.textContent = text;
}

async function loadListings() {
  const params = new URLSearchParams({ page, limit: LIMIT });
  for (const [key, value] of new FormData(form)) if (value.trim()) params.set(key, value.trim());

  prev.disabled = next.disabled = true;
  list.replaceChildren();
  setStatus('loading', 'Chargement des annonces…');

  try {
    const payload = validatePage(await getJson(`/listings?${params}`));
    pages = Math.max(1, payload.pages);
    renderCards(payload.data, list, openDetail);
    setStatus('success', payload.total ? `${payload.total} annonces` : 'Aucune annonce ne correspond à ces filtres.');
  } catch (error) {
    setStatus('error', error.message);
  } finally {
    pageInfo.textContent = `Page ${page} / ${pages}`;
    prev.disabled = page <= 1;
    next.disabled = page >= pages;
  }
}

async function openDetail(id) {
  detailBody.textContent = 'Chargement…';
  dialog.showModal();
  try {
    renderDetail(validateListing(await getJson(`/listings/${encodeURIComponent(id)}`)), detailBody);
  } catch (error) {
    detailBody.textContent = error.message;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  page = 1;
  // --- Temps réel (SSE) ---
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

const cardOf = (id) => [...list.children].find((li) => li.dataset.id === id);

function onEvent(handler) {
  return (event) => {
    try {
      handler(JSON.parse(event.data));
    } catch (error) {
      console.warn('Événement SSE ignoré :', error.message, event.data);
    }
  };
}

const events = new EventSource(`${API_URL}/events`);
events.addEventListener('open', () => { live.dataset.state = 'on'; live.textContent = 'En direct'; });
events.addEventListener('error', () => { live.dataset.state = 'off'; live.textContent = 'Reconnexion…'; });

events.addEventListener('created', onEvent((data) => {
  const listing = validateListing(data);
  toast(`Nouvelle annonce : ${listing.name}`, { label: 'Voir', run: () => openDetail(listing._id) });
}));

events.addEventListener('updated', onEvent((data) => {
  const listing = validateListing(data);
  const card = cardOf(listing._id);
  if (card) {
    const fresh = renderCard(listing, openDetail);
    fresh.classList.add('flash');
    card.replaceWith(fresh);
  }
  toast(`Annonce modifiée : ${listing.name}`);
}));

events.addEventListener('deleted', onEvent((data) => {
  if (typeof data?._id !== 'string') throw new Error('Réponse incompatible avec le contrat attendu.');
  cardOf(data._id)?.remove();
  toast(`Annonce supprimée : ${data._id}`);
}));

loadListings();
});
prev.addEventListener('click', () => { page -= 1; loadListings(); });
next.addEventListener('click', () => { page += 1; loadListings(); });
dialog.querySelector('.close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

loadListings();
