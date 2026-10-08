// Normalisation de la recherche (même règle dans l'API et le front) :
// Unicode composé (é saisi « e + ◌́ » = é), espaces et caractères de contrôle réduits, ponctuation retirée
// en bordure de mot (« porto, » → « porto »), mots vides ou en double ignorés, longueurs bornées.
export function normalizeQuery(q) {
  const seen = new Set();
  const words = [];
  for (const raw of String(q ?? '').normalize('NFC').slice(0, 200).split(/[\s\p{Cc}]+/u)) {
    const word = raw.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '').slice(0, 50);
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    words.push(word);
    if (words.length === 8) break;
  }
  return words;
}

const isText = (value) => typeof value === 'string' && value.trim() !== '';

// Contrat : _id texte non vide, name chaîne (vide dans 8 annonces de sample_airbnb, donc accepté).
const isListing = (listing) => listing && isText(listing._id) && typeof listing.name === 'string';

export const titleOf = (listing) => listing.name.trim() || 'Annonce sans titre';

// Les actions du TP (réserver, annuler) sont limitées aux annonces fictives créées par l'interface.
export const isTestListing = (listing) => listing._id.startsWith('test-');
const isBooked = (listing) => listing.status === 'BOOKED';

export function validatePage(payload) {
  if (!payload || !Array.isArray(payload.data) || !Number.isInteger(payload.page) || !Number.isInteger(payload.pages)) {
    throw new Error('Réponse incompatible avec le contrat attendu.');
  }
  if (!payload.data.every(isListing)) throw new Error('Réponse incompatible avec le contrat attendu.');
  return payload;
}

export function validateListing(listing) {
  if (!isListing(listing)) throw new Error('Réponse incompatible avec le contrat attendu.');
  return listing;
}

const formatPrice = (price) => (typeof price === 'number' ? `${price.toFixed(0)} $ / nuit` : 'Prix inconnu');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Certaines photos de sample_airbnb ont disparu chez Airbnb (404) : on affiche un emplacement explicite.
function image(listing) {
  const placeholder = () => el('div', 'thumb placeholder', 'Photo indisponible');
  const url = listing.images?.picture_url;
  if (!url) return placeholder();
  const img = el('img', 'thumb');
  img.alt = '';
  img.loading = 'lazy';
  img.src = url;
  img.addEventListener('error', () => img.replaceWith(placeholder()), { once: true });
  return img;
}

export function renderCards(listings, list, onSelect) {
  list.replaceChildren(...listings.map((listing) => renderCard(listing, onSelect)));
}

export function renderCard(listing, onSelect) {
  const item = el('li');
  item.dataset.id = listing._id;
  const card = el('button', 'card');
  card.type = 'button';
  card.addEventListener('click', () => onSelect(listing._id));

  const rating = listing.review_scores?.review_scores_rating;
  const place = [listing.address?.market, listing.address?.country].filter(Boolean).join(', ');

  const body = el('div', 'card-body');
  body.append(
    el('span', 'card-place', place || 'Lieu inconnu'),
    el('span', 'card-title', titleOf(listing)),
    el('span', 'card-meta', `${listing.property_type ?? '—'} · ${listing.accommodates ?? '?'} pers. · ${listing.bedrooms ?? '?'} ch.`),
    el('span', 'card-footer', ''),
  );
  body.lastChild.append(
    el('strong', '', formatPrice(listing.price)),
    el('span', 'rating', typeof rating === 'number' ? `★ ${rating}` : 'Pas de note'),
  );

  const media = el('div', 'media');
  media.append(image(listing));
  if (isBooked(listing)) media.append(el('span', 'badge', 'Réservé'));
  card.append(media, body);
  item.append(card);
  return item;
}

export function renderDetail(listing, container, { message = '', mine = false, confirmDelete = false, onReserve, onRelease, onEdit, onDelete, onAskDelete } = {}) {
  // street contient déjà ville et pays dans sample_airbnb : on ne les répète pas.
  const place = listing.address?.street || [listing.address?.market, listing.address?.country].filter(Boolean).join(', ');
  const facts = [
    ['Type', `${listing.property_type ?? '—'} · ${listing.room_type ?? '—'}`],
    ['Capacité', `${listing.accommodates ?? '?'} personnes`],
    ['Chambres / lits', `${listing.bedrooms ?? '?'} / ${listing.beds ?? '?'}`],
    ['Salles de bain', listing.bathrooms ?? '—'],
    ['Prix', formatPrice(listing.price)],
    ['Nuits minimum', listing.minimum_nights ?? '—'],
    ['Annulation', listing.cancellation_policy ?? '—'],
    ['Avis', `${listing.number_of_reviews ?? 0} (note ${listing.review_scores?.review_scores_rating ?? '—'})`],
    ['Hôte', listing.host?.host_name ?? '—'],
  ];

  const dl = el('dl', 'facts');
  for (const [term, value] of facts) dl.append(el('dt', '', term), el('dd', '', String(value)));

  const amenities = el('ul', 'amenities');
  amenities.append(...(listing.amenities ?? []).slice(0, 24).map((a) => el('li', '', a)));

  const reviews = el('ul', 'reviews');
  reviews.append(
    ...(listing.reviews ?? []).slice(0, 3).map((r) => {
      const li = el('li');
      li.append(el('strong', '', r.reviewer_name ?? 'Anonyme'), el('p', '', r.comments ?? ''));
      return li;
    }),
  );

  const actions = el('div', 'actions');
  if (isTestListing(listing)) {
    const reserve = el('button', 'primary', isBooked(listing) ? 'Indisponible' : 'Réserver');
    reserve.type = 'button';
    reserve.disabled = isBooked(listing);
    reserve.addEventListener('click', () => { reserve.disabled = true; onReserve?.(listing._id); });
    const label = isBooked(listing) ? (mine ? 'Réservé par vous' : 'Réservé') : 'Disponible';
    actions.append(el('span', `availability ${isBooked(listing) ? 'booked' : 'available'}`, label), reserve);
    if (isBooked(listing) && mine) {
      const release = el('button', '', 'Annuler la réservation');
      release.type = 'button';
      release.addEventListener('click', () => onRelease?.(listing._id));
      actions.append(release);
    }
  } else {
    actions.append(el('span', 'hint', isBooked(listing) ? 'Réservé' : 'Réservation possible uniquement sur les annonces de test.'));
  }

  const manage = el('div', 'actions');
  const edit = el('button', '', 'Modifier');
  edit.type = 'button';
  edit.addEventListener('click', () => onEdit?.());
  if (confirmDelete) {
    const confirm = el('button', 'danger', 'Confirmer la suppression');
    confirm.type = 'button';
    confirm.addEventListener('click', () => { confirm.disabled = true; onDelete?.(); });
    const keep = el('button', '', 'Garder l’annonce');
    keep.type = 'button';
    keep.addEventListener('click', () => onAskDelete?.(false));
    manage.append(el('span', 'hint', 'Supprimer définitivement cette annonce ?'), confirm, keep);
  } else {
    const remove = el('button', 'danger-outline', 'Supprimer');
    remove.type = 'button';
    remove.addEventListener('click', () => onAskDelete?.(true));
    manage.append(edit, remove);
  }

  container.replaceChildren(
    image(listing),
    el('h2', '', titleOf(listing)),
    actions,
    manage,
    ...(message ? [el('p', 'message', message)] : []),
    el('p', 'card-place', place),
    el('p', 'summary', listing.summary || listing.description || ''),
    dl,
    ...(amenities.childElementCount ? [el('h3', '', 'Équipements'), amenities] : []),
    ...(reviews.childElementCount ? [el('h3', '', 'Derniers avis'), reviews] : []),
  );
}

// --- Formulaire de création / modification ---
// path : chemin pointé dans le document (address.market) ; utilisé tel quel pour un PATCH partiel.
const FIELDS = [
  { path: 'name', label: 'Nom', type: 'text', required: true },
  { path: 'summary', label: 'Résumé', type: 'textarea' },
  { path: 'property_type', label: 'Type de logement', type: 'text' },
  { path: 'room_type', label: 'Type de location', type: 'text' },
  { path: 'accommodates', label: 'Capacité (personnes)', type: 'number', min: 1, step: 1 },
  { path: 'bedrooms', label: 'Chambres', type: 'number', min: 0, step: 1 },
  { path: 'beds', label: 'Lits', type: 'number', min: 0, step: 1 },
  { path: 'price', label: 'Prix par nuit ($)', type: 'number', min: 0, step: 'any' },
  { path: 'address.market', label: 'Ville', type: 'text' },
  { path: 'address.country', label: 'Pays', type: 'text' },
  { path: 'images.picture_url', label: 'URL de la photo', type: 'url' },
];

const read = (obj, path) => path.split('.').reduce((value, key) => value?.[key], obj);

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let target = obj;
  for (const key of keys) target = target[key] ??= {};
  target[last] = value;
}

// Création : document imbriqué. Modification : seulement les champs changés, en chemins pointés.
function collect(form, listing) {
  const values = {};
  for (const field of FIELDS) {
    const raw = form.elements[field.path].value.trim();
    const value = field.type === 'number' ? (raw === '' ? null : Number(raw)) : raw;
    if (!listing) {
      if (value !== '' && value !== null) setPath(values, field.path, value);
    } else if (value !== (read(listing, field.path) ?? (field.type === 'number' ? null : ''))) {
      values[field.path] = value;
    }
  }
  return values;
}

export function renderForm(listing, container, { message = '', onSubmit, onCancel } = {}) {
  const form = el('form', 'edit-form');
  form.noValidate = false;
  for (const field of FIELDS) {
    const label = el('label', '', field.label);
    const input = el(field.type === 'textarea' ? 'textarea' : 'input');
    input.name = field.path;
    if (field.type !== 'textarea') input.type = field.type;
    if (field.required) input.required = true;
    if (field.min !== undefined) input.min = field.min;
    if (field.step !== undefined) input.step = field.step;
    const current = read(listing, field.path);
    input.value = current ?? '';
    label.append(input);
    form.append(label);
  }

  const buttons = el('div', 'actions');
  const save = el('button', 'primary', listing ? 'Enregistrer' : 'Créer l’annonce');
  save.type = 'submit';
  const cancel = el('button', '', 'Annuler');
  cancel.type = 'button';
  cancel.addEventListener('click', () => onCancel?.());
  buttons.append(save, cancel);
  form.append(buttons);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    save.disabled = true;
    onSubmit?.(collect(form, listing));
  });

  container.replaceChildren(
    el('h2', '', listing ? `Modifier « ${titleOf(listing)} »` : 'Nouvelle annonce'),
    ...(message ? [el('p', 'message', message)] : []),
    form,
  );
  form.elements.name.focus();
}
