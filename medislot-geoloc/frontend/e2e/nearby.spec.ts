import {test, expect, type Page} from '@playwright/test';

// Positions simulées (places publiques) : jamais besoin d'aller à Lyon, ni de partager sa vraie position.
const BELLECOUR = {latitude: 45.7576, longitude: 4.8317};

// Aucun appel réel aux services tiers pendant les tests : tuiles OSM bloquées, géocodeur remplacé par une réponse relevée.
async function offline(page: Page) {
  await page.route('https://tile.openstreetmap.org/**', r => r.abort());
  await page.route('https://data.geopf.fr/geocodage/search**', r => r.fulfill({json: {features: [{
    geometry: {type: 'Point', coordinates: [4.8344, 45.7578]}, // GeoJSON : [lon, lat]
    properties: {label: '69002 Lyon', score: 0.75, type: 'municipality'}}]}}));
}

test.describe('position autorisée', () => {
  test.use({geolocation: BELLECOUR, permissions: ['geolocation']});

  test('« Autour de moi » liste les six praticiens de Bellecour, du plus proche au plus loin', async ({page}) => {
    await offline(page);
    await page.goto('/');
    const request = page.waitForRequest(r => r.url().includes('/api/professionals?lat='));
    await page.getByRole('button', {name: 'Autour de moi (5 km)'}).click();
    const url = new URL((await request).url());
    expect(url.searchParams.get('lat')).toBe('45.758'); // arrondi avant l'envoi
    expect(url.searchParams.get('lon')).toBe('4.832');
    await expect(page.getByRole('heading', {name: '6 praticiens à moins de 5 km'})).toBeVisible();
    // 0,22 km depuis le point exact, 0,25 km depuis le point arrondi (45.758, 4.832) : l'arrondi se voit, de 100 m au plus.
    await expect(page.locator('.distance').first()).toHaveText('À 300 m à vol d’oiseau');
    await expect(page.locator('.doctor-card .name-link').first()).toHaveText('Dr Amel Benali');

    await page.getByLabel('Spécialité').selectOption('cardiology');
    await expect(page.getByRole('heading', {name: '2 praticiens à moins de 5 km'})).toBeVisible();

    await page.getByRole('button', {name: 'Voir sur une carte'}).click();
    await expect(page.locator('.leaflet-control-attribution')).toContainText('© OpenStreetMap contributors');
    await expect(page.locator('.leaflet-interactive')).toHaveCount(4); // cercle, centre, deux cabinets
    await expect(page.locator('.doctor-card')).toHaveCount(2); // la liste reste là
  });
});

test('permission refusée : un message, puis l’adresse mène à la liste', async ({page}) => {
  await offline(page); // aucune permission accordée : Chromium refuse la géolocalisation
  await page.goto('/');
  await page.getByRole('button', {name: 'Autour de moi (5 km)'}).click();
  await expect(page.getByRole('alert')).toHaveText('Localisation refusée. Saisissez une adresse ou un code postal.');
  await page.getByLabel('ou une adresse, un code postal').fill('69002 Lyon');
  await page.getByRole('button', {name: 'Chercher autour'}).click();
  await expect(page.getByRole('heading', {name: /praticiens à moins de 5 km/})).toBeVisible();
  await expect(page.getByText('autour de 69002 Lyon')).toBeVisible();
});
