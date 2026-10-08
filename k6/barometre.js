// Un palier du baromètre : débit constant RATE req/s pendant DURATION secondes.
// ci/barometre.sh l'enchaîne en augmentant RATE petit à petit jusqu'à la rupture.
// Usage : k6 run -e RATE=200 -e DURATION=10 -e OUT=k6/palier.json k6/barometre.js
import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const RATE = Number(__ENV.RATE || 50);
const DURATION = Number(__ENV.DURATION || 10);

export const options = {
  scenarios: {
    palier: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: `${DURATION}s`,
      preAllocatedVUs: Math.min(RATE, 200),
      maxVUs: 2000,
    },
  },
  summaryTrendStats: ['med', 'p(95)', 'max'],
};

export function setup() {
  const res = http.get(`${BASE_URL}/listings?limit=50`);
  if (res.status !== 200) throw new Error(`API indisponible (HTTP ${res.status})`);
  return { pages: Math.max(1, Math.min(50, res.json('pages'))), ids: res.json('data').map((l) => l._id) };
}

// 70 % de pages de liste, 30 % de fiches détail.
export default function ({ pages, ids }) {
  const params = { timeout: '5s' };
  if (Math.random() < 0.7) {
    const page = Math.floor(Math.random() * pages) + 1;
    http.get(`${BASE_URL}/listings?page=${page}&limit=20`, { ...params, tags: { name: 'GET /listings' } });
  } else {
    const id = ids[Math.floor(Math.random() * ids.length)];
    http.get(`${BASE_URL}/listings/${id}`, { ...params, tags: { name: 'GET /listings/:id' } });
  }
}

export function handleSummary(data) {
  const m = data.metrics;
  // setup() fait une requête hors palier : on la retire du décompte.
  const result = {
    rate: RATE,
    served: Math.max(0, (m.http_reqs?.values.count ?? 1) - 1) / DURATION,
    p95: m.http_req_duration?.values['p(95)'] ?? null,
    errors: m.http_req_failed?.values.rate ?? 0,
    dropped: m.dropped_iterations?.values.count ?? 0,
  };
  return { [__ENV.OUT || 'k6/palier.json']: JSON.stringify(result) };
}
