// Géolocalisation côté front : obtenir une position (navigateur) ou géocoder une adresse, puis préparer
// les paramètres du contrat. Ordre partout dans ce fichier : latitude, longitude, SAUF dans les réponses
// GeoJSON du géocodeur, écrites [longitude, latitude] (commentées là où on les lit).
// Aucune position n'est stockée (ni localStorage, ni journal) : elle vit le temps de la recherche.

export interface Position {lat: number; lon: number; accuracyM?: number; label?: string}

export type GeoReason = 'insecure' | 'unsupported' | 'denied' | 'unavailable' | 'timeout' | 'busy' | 'not-found' | 'network';

/** Messages affichés au patient, tels quels. Chaque refus mène à une autre voie : l'adresse. */
export const GEO_MESSAGES: Record<GeoReason, string> = {
  insecure: 'La localisation exige une page sécurisée (HTTPS). Saisissez une adresse ou un code postal.',
  unsupported: 'Votre navigateur ne sait pas donner votre position. Saisissez une adresse ou un code postal.',
  denied: 'Localisation refusée. Saisissez une adresse ou un code postal.',
  unavailable: 'Position introuvable pour le moment. Saisissez une adresse.',
  timeout: 'La localisation prend trop de temps. Réessayez ou saisissez une adresse.',
  busy: 'Le service d’adresses est très sollicité. Réessayez dans une seconde.',
  'not-found': 'Adresse introuvable ou trop imprécise. Précisez la ville ou le code postal.',
  network: 'Le service d’adresses ne répond pas. Vérifiez le réseau puis réessayez.',
};

export class GeoError extends Error {
  constructor(public reason: GeoReason) {
    super(GEO_MESSAGES[reason]);
    this.name = 'GeoError';
  }
}

/** GeolocationPositionError.code : 1, 2, 3. */
export const REASON_BY_CODE: Record<number, GeoReason> = {1: 'denied', 2: 'unavailable', 3: 'timeout'};

/** Rayon de 5 km : inutile de réveiller le GPS. 10 s au plus, position de moins de 5 minutes acceptée. */
export const POSITION_OPTIONS: PositionOptions = {enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000};

/** Ce dont getPosition a besoin du navigateur, regroupé pour pouvoir tester sans navigateur. */
export interface GeoEnv {secure: boolean; geolocation?: Pick<Geolocation, 'getCurrentPosition'>}

export function browserEnv(): GeoEnv {
  return {secure: window.isSecureContext, geolocation: navigator.geolocation};
}

/** À appeler après un clic sur « Autour de moi », jamais au chargement de la page. */
export function getPosition(env: GeoEnv = browserEnv()): Promise<Position> {
  if (!env.secure) return Promise.reject(new GeoError('insecure')); // HTTP hors localhost : refus d'office
  if (!env.geolocation) return Promise.reject(new GeoError('unsupported'));
  return new Promise((resolve, reject) => {
    env.geolocation!.getCurrentPosition(
      p => resolve({lat: p.coords.latitude, lon: p.coords.longitude, accuracyM: p.coords.accuracy}),
      e => reject(new GeoError(REASON_BY_CODE[e.code] ?? 'unavailable')),
      POSITION_OPTIONS,
    );
  });
}

/** 3 décimales : environ 111 m en latitude. La précision au mètre ne quitte pas l'appareil. */
export function roundCoord(x: number, decimals = 3): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

export const RADIUS_KM = 5;

/** Paramètres du contrat GET /api/professionals : noms exacts, position arrondie, rayon en km. */
export function nearbyParams(p: {lat: number; lon: number; radiusKm?: number; specialty?: string; page?: number; size?: number}): URLSearchParams {
  const params = new URLSearchParams({
    lat: String(roundCoord(p.lat)),
    lon: String(roundCoord(p.lon)),
    radiusKm: String(p.radiusKm ?? RADIUS_KM),
    page: String(p.page ?? 0),
    size: String(p.size ?? 6),
  });
  if (p.specialty) params.set('specialty', p.specialty);
  return params;
}

/** « 200 m » sous 1 km, « 1,2 km » au-delà (à la française). Distance à vol d'oiseau. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toLocaleString('fr-FR', {maximumFractionDigits: 1})} km`;
}

/** Géoplateforme de l'IGN (données BAN) : gratuite, sans clé, 50 requêtes par seconde et par adresse IP. */
export const GEOCODER_URL = 'https://data.geopf.fr/geocodage/search';
/** Sous ce score, le premier résultat est souvent dans une autre commune : on demande de préciser. */
export const MIN_SCORE = 0.5;

const cache = new Map<string, Position>();
export function clearGeocodeCache() { cache.clear(); }

/** Espaces et casse ne changent pas l'adresse : « 69002  LYON » et « 69002 lyon » font un seul appel. */
export function cacheKey(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR');
}

export async function geocode(query: string, fetchFn: typeof fetch = fetch): Promise<Position> {
  const key = cacheKey(query);
  if (key.length < 3) throw new GeoError('not-found');
  const hit = cache.get(key);
  if (hit) return hit; // même adresse : aucun nouvel appel
  const params = new URLSearchParams({q: key, limit: '1'});
  let r: Response;
  try {
    r = await fetchFn(`${GEOCODER_URL}?${params}`);
  } catch {
    throw new GeoError('network');
  }
  if (r.status === 429) throw new GeoError('busy'); // trop de requêtes
  if (!r.ok) throw new GeoError('network');
  const f = (await r.json()).features?.[0];
  if (!f || typeof f.properties?.score !== 'number' || f.properties.score < MIN_SCORE) throw new GeoError('not-found');
  const [lon, lat] = f.geometry.coordinates; // GeoJSON : [lon, lat], l'inverse du reste de MediSlot
  const position: Position = {lat, lon, label: f.properties.label};
  cache.set(key, position);
  return position;
}
