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

export function renderDetail(listing, container, { message = '', mine = false, onReserve, onRelease } = {}) {
  const place = [listing.address?.street, listing.address?.country].filter(Boolean).join(', ');
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

  container.replaceChildren(
    image(listing),
    el('h2', '', titleOf(listing)),
    actions,
    ...(message ? [el('p', 'message', message)] : []),
    el('p', 'card-place', place),
    el('p', 'summary', listing.summary || listing.description || ''),
    dl,
    ...(amenities.childElementCount ? [el('h3', '', 'Équipements'), amenities] : []),
    ...(reviews.childElementCount ? [el('h3', '', 'Derniers avis'), reviews] : []),
  );
}
