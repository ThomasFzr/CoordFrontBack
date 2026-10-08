import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '15s', target: 10 },
    { duration: '30s', target: 10 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

export function setup() {
  const res = http.get(`${BASE_URL}/listings?limit=20`);
  if (res.status !== 200) throw new Error(`API indisponible (HTTP ${res.status})`);
  return { pages: Math.min(50, res.json('pages')) };
}

export default function ({ pages }) {
  const page = Math.floor(Math.random() * pages) + 1;
  const list = http.get(`${BASE_URL}/listings?page=${page}&limit=20`, { tags: { name: 'GET /listings' } });
  check(list, {
    'list status 200': (r) => r.status === 200,
    'list has data': (r) => r.json('data').length > 0,
  });

  const ids = list.json('data').map((l) => l._id);
  if (ids.length) {
    const id = ids[Math.floor(Math.random() * ids.length)];
    const detail = http.get(`${BASE_URL}/listings/${id}`, { tags: { name: 'GET /listings/:id' } });
    check(detail, { 'detail status 200': (r) => r.status === 200 });
  }

  sleep(1);
}
