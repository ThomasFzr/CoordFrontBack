import cors from 'cors';
import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';

const config = {
  port: process.env.PORT ?? 3000,
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017',
  dbName: process.env.MONGO_DB ?? 'sample_airbnb',
  collection: process.env.MONGO_COLLECTION ?? 'listingsAndReviews',
};

const client = new MongoClient(config.mongoUri);
const listings = client.db(config.dbName).collection(config.collection);

const LIST_PROJECTION = {
  name: 1,
  summary: 1,
  property_type: 1,
  room_type: 1,
  accommodates: 1,
  bedrooms: 1,
  beds: 1,
  price: 1,
  'images.picture_url': 1,
  'address.market': 1,
  'address.country': 1,
  'review_scores.review_scores_rating': 1,
  status: 1,
  version: 1,
};
// La réservation (customerId) n'est jamais renvoyée par les lectures publiques.
const PUBLIC_PROJECTION = { booking: 0 };

const decimalReplacer = (key, value) =>
  value && typeof value === 'object' && '$numberDecimal' in value ? Number(value.$numberDecimal) : value;

// --- Server-Sent Events ---
// L'API enregistre, puis notifie ; le front relit la liste. Le flux ne transporte que des
// données publiques minimales (listingId, change, version) : jamais de customerId ni de réservation.
const HEARTBEAT_MS = Number(process.env.SSE_HEARTBEAT_MS ?? 15_000);
const sseClients = new Set();
let sequence = 0; // identifiant d'événement local au processus : pas un historique rejouable

// Un client en erreur est retiré sans faire échouer l'écriture qui a déclenché la notification.
function send(res, chunk) {
  try {
    res.write(chunk);
  } catch {
    sseClients.delete(res);
  }
}

function notifyChanged(listingId, change, version) {
  const data = JSON.stringify({ listingId, change, version: version ?? null });
  const message = `id: ${++sequence}\nevent: listing-updated\ndata: ${data}\n\n`;
  for (const res of sseClients) send(res, message);
}

setInterval(() => {
  for (const res of sseClients) send(res, ': keepalive\n\n');
}, HEARTBEAT_MS).unref();

const app = express();
app.use(cors());
app.use(express.json());
app.set('json replacer', decimalReplacer);

app.get('/', (req, res) => {
  res.json({
    name: 'Listings API',
    endpoints: [
      'GET /health',
      'GET /listings?page=&limit=&q=&property_type=&country=&market=',
      'GET /listings/:id',
      'POST /listings',
      'PUT /listings/:id',
      'PATCH /listings/:id',
      'DELETE /listings/:id',
      'POST /listings/:id/reservations   { customerId } → 201 | 409 | 404',
      'DELETE /listings/:id/reservations → 204 | 404',
      'GET /events (SSE : ready, listing-updated, : keepalive)',
    ],
  });
});

app.get('/health', async (req, res) => {
  await client.db('admin').command({ ping: 1 });
  res.json({ status: 'UP' });
});

app.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  sseClients.add(res);
  res.on('error', () => sseClients.delete(res));
  req.on('close', () => sseClients.delete(res));
  send(res, `retry: 2000\nevent: ready\ndata: ${JSON.stringify({ action: 'reload' })}\n\n`);
});

app.get('/listings', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const filter = {};
  if (req.query.q) filter.name = { $regex: req.query.q, $options: 'i' };
  if (req.query.property_type) filter.property_type = req.query.property_type;
  if (req.query.country) filter['address.country'] = req.query.country;
  if (req.query.market) filter['address.market'] = req.query.market;

  const [total, data] = await Promise.all([
    listings.countDocuments(filter),
    listings
      .find(filter, { projection: LIST_PROJECTION })
      .sort({ _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
  ]);

  res.json({ page, limit, total, pages: Math.ceil(total / limit), data });
});

app.get('/listings/:id', async (req, res) => {
  const listing = await listings.findOne({ _id: req.params.id }, { projection: PUBLIC_PROJECTION });
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  res.json(listing);
});

app.post('/listings', async (req, res) => {
  if (!req.body?.name) return res.status(400).json({ error: '"name" is required' });
  const { booking, status, version, ...fields } = req.body;
  const doc = { ...fields, _id: String(req.body._id ?? new ObjectId()), version: 1 };
  if (await listings.findOne({ _id: doc._id }, { projection: { _id: 1 } })) {
    return res.status(409).json({ error: 'Listing already exists' });
  }
  await listings.insertOne(doc);
  notifyChanged(doc._id, 'created', doc.version);
  res.status(201).location(`/listings/${doc._id}`).json(doc);
});

app.put('/listings/:id', async (req, res) => {
  if (!req.body?.name) return res.status(400).json({ error: '"name" is required' });
  const { _id, booking, status, version, ...doc } = req.body;
  const current = await listings.findOne({ _id: req.params.id }, { projection: { version: 1, status: 1, booking: 1 } });
  if (!current) return res.status(404).json({ error: 'Listing not found' });
  // Remplacer le contenu ne libère pas une réservation : statut et réservation sont conservés.
  const kept = Object.fromEntries(Object.entries({ status: current.status, booking: current.booking }).filter(([, v]) => v !== undefined));
  const result = await listings.findOneAndReplace(
    { _id: req.params.id },
    { ...doc, ...kept, version: (current.version ?? 0) + 1 },
    { returnDocument: 'after', projection: PUBLIC_PROJECTION },
  );
  if (!result) return res.status(404).json({ error: 'Listing not found' });
  notifyChanged(result._id, 'updated', result.version);
  res.json(result);
});

app.patch('/listings/:id', async (req, res) => {
  const { _id, booking, status, version, ...changes } = req.body ?? {};
  if (Object.keys(changes).length === 0) return res.status(400).json({ error: 'Empty body' });
  const result = await listings.findOneAndUpdate(
    { _id: req.params.id },
    { $set: changes, $inc: { version: 1 } },
    { returnDocument: 'after', projection: PUBLIC_PROJECTION },
  );
  if (!result) return res.status(404).json({ error: 'Listing not found' });
  notifyChanged(result._id, 'updated', result.version);
  res.json(result);
});

app.delete('/listings/:id', async (req, res) => {
  const { deletedCount } = await listings.deleteOne({ _id: req.params.id });
  if (!deletedCount) return res.status(404).json({ error: 'Listing not found' });
  notifyChanged(req.params.id, 'deleted', null);
  res.status(204).end();
});

// Réservation : mise à jour conditionnelle, la base garantit qu'une seule demande l'emporte.
app.post('/listings/:id/reservations', async (req, res) => {
  const customerId = req.body?.customerId;
  if (typeof customerId !== 'string' || !customerId.trim()) {
    return res.status(400).json({ error: '"customerId" is required' });
  }
  const winner = await listings.findOneAndUpdate(
    { _id: req.params.id, status: { $ne: 'BOOKED' } },
    { $set: { status: 'BOOKED', booking: { customerId, at: new Date() } }, $inc: { version: 1 } },
    { returnDocument: 'after', projection: { status: 1, version: 1 } },
  );
  if (!winner) {
    const exists = await listings.findOne({ _id: req.params.id }, { projection: { _id: 1 } });
    return exists
      ? res.status(409).json({ error: 'Listing already booked' })
      : res.status(404).json({ error: 'Listing not found' });
  }
  notifyChanged(winner._id, 'reserved', winner.version);
  res.status(201).json({ listingId: winner._id, status: winner.status, version: winner.version });
});

app.delete('/listings/:id/reservations', async (req, res) => {
  const freed = await listings.findOneAndUpdate(
    { _id: req.params.id, status: 'BOOKED' },
    { $set: { status: 'AVAILABLE' }, $unset: { booking: '' }, $inc: { version: 1 } },
    { returnDocument: 'after', projection: { version: 1 } },
  );
  if (!freed) return res.status(404).json({ error: 'No reservation for this listing' });
  notifyChanged(freed._id, 'released', freed.version);
  res.status(204).end();
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message });
});

await client.connect();
console.log(`Connected to MongoDB, using ${config.dbName}.${config.collection}`);
const server = app.listen(config.port, () => console.log(`Listings API listening on ${config.port}`));

process.on('SIGTERM', async () => {
  for (const res of sseClients) res.end();
  server.close();
  await client.close();
  process.exit(0);
});
