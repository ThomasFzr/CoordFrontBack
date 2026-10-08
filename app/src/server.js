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
};

const decimalReplacer = (key, value) =>
  value && typeof value === 'object' && '$numberDecimal' in value ? Number(value.$numberDecimal) : value;

// --- Server-Sent Events : diffusion des écritures faites via cette instance de l'API ---
const sseClients = new Set();
let lastEventId = 0;

const toSummary = (doc) => ({
  _id: doc._id,
  name: doc.name,
  summary: doc.summary,
  property_type: doc.property_type,
  room_type: doc.room_type,
  accommodates: doc.accommodates,
  bedrooms: doc.bedrooms,
  beds: doc.beds,
  price: doc.price,
  images: { picture_url: doc.images?.picture_url },
  address: { market: doc.address?.market, country: doc.address?.country },
  review_scores: { review_scores_rating: doc.review_scores?.review_scores_rating },
});

function broadcast(type, data) {
  const message = `id: ${++lastEventId}\nevent: ${type}\ndata: ${JSON.stringify(data, decimalReplacer)}\n\n`;
  for (const res of sseClients) res.write(message);
}

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
      'GET /events (SSE : created, updated, deleted)',
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
  res.write(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ clients: sseClients.size + 1 })}\n\n`);
  sseClients.add(res);

  // Commentaire périodique : garde la connexion ouverte à travers proxies et répartiteurs.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
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
  const listing = await listings.findOne({ _id: req.params.id });
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  res.json(listing);
});

app.post('/listings', async (req, res) => {
  if (!req.body?.name) return res.status(400).json({ error: '"name" is required' });
  const doc = { ...req.body, _id: String(req.body._id ?? new ObjectId()) };
  if (await listings.findOne({ _id: doc._id }, { projection: { _id: 1 } })) {
    return res.status(409).json({ error: 'Listing already exists' });
  }
  await listings.insertOne(doc);
  broadcast('created', toSummary(doc));
  res.status(201).location(`/listings/${doc._id}`).json(doc);
});

app.put('/listings/:id', async (req, res) => {
  if (!req.body?.name) return res.status(400).json({ error: '"name" is required' });
  const { _id, ...doc } = req.body;
  const result = await listings.findOneAndReplace({ _id: req.params.id }, doc, { returnDocument: 'after' });
  if (!result) return res.status(404).json({ error: 'Listing not found' });
  broadcast('updated', toSummary(result));
  res.json(result);
});

app.patch('/listings/:id', async (req, res) => {
  const { _id, ...changes } = req.body ?? {};
  if (Object.keys(changes).length === 0) return res.status(400).json({ error: 'Empty body' });
  const result = await listings.findOneAndUpdate({ _id: req.params.id }, { $set: changes }, { returnDocument: 'after' });
  if (!result) return res.status(404).json({ error: 'Listing not found' });
  broadcast('updated', toSummary(result));
  res.json(result);
});

app.delete('/listings/:id', async (req, res) => {
  const { deletedCount } = await listings.deleteOne({ _id: req.params.id });
  if (!deletedCount) return res.status(404).json({ error: 'Listing not found' });
  broadcast('deleted', { _id: req.params.id });
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
