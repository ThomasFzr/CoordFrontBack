import { renderCards, renderDetail, validateListing, validatePage } from './view.js';

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
  loadListings();
});
prev.addEventListener('click', () => { page -= 1; loadListings(); });
next.addEventListener('click', () => { page += 1; loadListings(); });
dialog.querySelector('.close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

loadListings();
