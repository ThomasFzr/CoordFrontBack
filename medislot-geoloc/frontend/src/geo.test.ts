import {describe, it, expect, vi, beforeEach} from 'vitest';
import {
  getPosition, roundCoord, nearbyParams, formatDistance, geocode, clearGeocodeCache,
  GeoError, GEO_MESSAGES, POSITION_OPTIONS, GEOCODER_URL, type GeoEnv,
} from './geo';

/** Faux navigateur : soit une position (place Bellecour), soit une erreur 1, 2 ou 3. */
function fakeEnv(answer: {code: number} | {lat: number; lon: number; accuracy: number}, secure = true) {
  const getCurrentPosition = vi.fn((ok: PositionCallback, ko?: PositionErrorCallback | null, _options?: PositionOptions) => {
    if ('code' in answer) ko?.({code: answer.code, message: ''} as GeolocationPositionError);
    else ok({coords: {latitude: answer.lat, longitude: answer.lon, accuracy: answer.accuracy}} as GeolocationPosition);
  });
  const env: GeoEnv = {secure, geolocation: {getCurrentPosition}};
  return {env, getCurrentPosition};
}

/** Réponse réelle réduite de la Géoplateforme, relevée le 16/11/2026 (q=6 rue de la Charité 69002 Lyon). */
function geoJson(coordinates: [number, number], score: number, label = '6 Rue de la Charité 69002 Lyon') {
  return new Response(JSON.stringify({features: [{geometry: {type: 'Point', coordinates}, properties: {label, score, type: 'housenumber'}}]}), {status: 200});
}

describe('Position', () => {
  it('renvoie latitude, longitude et précision, dans cet ordre, avec les options MediSlot', async () => {
    const {env, getCurrentPosition} = fakeEnv({lat: 45.757597, lon: 4.831662, accuracy: 1200});
    await expect(getPosition(env)).resolves.toEqual({lat: 45.757597, lon: 4.831662, accuracyM: 1200});
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000});
    expect(POSITION_OPTIONS.timeout).toBe(10_000);
  });

  it('traduit un refus de permission en message utile', async () => {
    const {env} = fakeEnv({code: 1}); // l'utilisateur a bloqué
    const err = await getPosition(env).catch(e => e);
    expect(err).toBeInstanceOf(GeoError);
    expect(err.reason).toBe('denied');
    expect(err.message).toBe(GEO_MESSAGES.denied);
  });

  it('distingue position introuvable (2) et délai dépassé (3)', async () => {
    expect((await getPosition(fakeEnv({code: 2}).env).catch(e => e)).reason).toBe('unavailable');
    expect((await getPosition(fakeEnv({code: 3}).env).catch(e => e)).reason).toBe('timeout');
  });

  it('hors contexte sécurisé, refuse sans même interroger le navigateur', async () => {
    const {env, getCurrentPosition} = fakeEnv({lat: 45.75, lon: 4.83, accuracy: 10}, false);
    expect((await getPosition(env).catch(e => e)).reason).toBe('insecure');
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('sans API Geolocation, propose la saisie d’adresse', async () => {
    expect((await getPosition({secure: true}).catch(e => e)).reason).toBe('unsupported');
  });
});

describe('Paramètres', () => {
  it('arrondit à 3 décimales (environ 111 m)', () => {
    expect(roundCoord(45.757597)).toBe(45.758);
    expect(roundCoord(4.831662)).toBe(4.832);
    expect(roundCoord(-0.5774625)).toBe(-0.577);
  });

  it('utilise les noms exacts du contrat et n’envoie jamais la position précise', () => {
    const p = nearbyParams({lat: 45.757597, lon: 4.831662, specialty: 'cardiology'});
    expect(Object.fromEntries(p)).toEqual({lat: '45.758', lon: '4.832', radiusKm: '5', page: '0', size: '6', specialty: 'cardiology'});
    expect(p.toString()).not.toContain('45.757597');
    expect(nearbyParams({lat: 45.75, lon: 4.83, page: 1}).has('specialty')).toBe(false);
  });
});

describe('Affichage', () => {
  it('écrit les mètres sous 1 km', () => {
    expect(formatDistance(0.2)).toBe('200 m');
    expect(formatDistance(0)).toBe('0 m');
  });

  it('écrit les kilomètres à la française au-delà', () => {
    expect(formatDistance(1.2)).toBe('1,2 km');
    expect(formatDistance(3)).toBe('3 km');
    expect(formatDistance(12.5)).toBe('12,5 km');
  });
});

describe('Géocodage', () => {
  beforeEach(() => clearGeocodeCache());

  it('lit coordinates en [lon, lat] : une adresse lyonnaise tombe à Lyon, pas en Somalie', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geoJson([4.832967, 45.755824], 0.97));
    const pos = await geocode('6 rue de la Charité 69002 Lyon', fetchFn);
    expect(pos).toEqual({lat: 45.755824, lon: 4.832967, label: '6 Rue de la Charité 69002 Lyon'});
    expect(pos.lat).toBeGreaterThan(45); // Lyon : latitude ~45,7, longitude ~4,8
    const url = new URL(fetchFn.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe(GEOCODER_URL);
    expect(url.searchParams.get('limit')).toBe('1');
  });

  it('ne fait qu’un appel pour deux saisies qui ne diffèrent que par les espaces et les majuscules', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geoJson([4.832967, 45.755824], 0.97));
    const a = await geocode('6 rue de la Charité 69002 Lyon', fetchFn);
    const b = await geocode('  6 RUE de la charité   69002 lyon ', fetchFn);
    expect(b).toEqual(a);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('refuse un résultat sous le seuil de score (mauvaise commune)', async () => {
    // Essai réel : « Place de la Mairie 69130 Écully » -> Meaux-la-Montagne, score 0,39.
    const fetchFn = vi.fn().mockResolvedValue(geoJson([4.67, 45.95], 0.39, 'Rue de la Mairie 69550 Meaux-la-Montagne'));
    expect((await geocode('Place de la Mairie 69130 Écully', fetchFn).catch(e => e)).reason).toBe('not-found');
  });

  it('traduit 429, réponse vide et panne réseau en messages', async () => {
    expect((await geocode('69002', vi.fn().mockResolvedValue(new Response('', {status: 429}))).catch(e => e)).reason).toBe('busy');
    expect((await geocode('zzzz', vi.fn().mockResolvedValue(new Response('{"features":[]}', {status: 200}))).catch(e => e)).reason).toBe('not-found');
    expect((await geocode('69003', vi.fn().mockRejectedValue(new TypeError('offline'))).catch(e => e)).reason).toBe('network');
  });

  it('ne garde pas un échec en cache', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response('', {status: 429}))
      .mockResolvedValueOnce(geoJson([4.8344, 45.7578], 0.75, '69002 Lyon'));
    await geocode('69002', fetchFn).catch(() => {});
    await expect(geocode('69002', fetchFn)).resolves.toMatchObject({lat: 45.7578, lon: 4.8344});
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
