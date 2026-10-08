// Fixture fictive au format de sample_airbnb.listingsAndReviews, chargée par mongosh en CI.
// SEED_COUNT (45 par défaut) : nombre d'annonces. Au-delà de 45, chaque annonce reçoit des avis
// pour approcher le poids des documents réels (baromètre de charge).
const listings = db.getSiblingDB('sample_airbnb').listingsAndReviews;
const count = Number(process.env.SEED_COUNT || 45);
const withReviews = count > 45;
const countries = [['Porto', 'Portugal'], ['Barcelona', 'Spain'], ['Montreal', 'Canada'], ['Sydney', 'Australia']];
const types = ['Apartment', 'House', 'Loft'];
const lorem =
  'Logement lumineux, bien situé, proche des transports et des commerces. Hôte réactif, ' +
  'arrivée autonome, literie confortable. Quartier calme le soir, animé en journée. ';

const listing = (i) => {
  const [market, country] = countries[i % countries.length];
  return {
    _id: `ci-${String(i + 1).padStart(withReviews ? 5 : 3, '0')}`,
    name: `Logement CI ${i + 1}`,
    summary: withReviews ? lorem.repeat(3) : 'Annonce fictive utilisée par la CI.',
    description: withReviews ? lorem.repeat(8) : undefined,
    property_type: types[i % types.length],
    room_type: 'Entire home/apt',
    accommodates: 2 + (i % 4),
    bedrooms: 1 + (i % 3),
    beds: 1 + (i % 3),
    price: NumberDecimal(String(40 + (i % 400) * 5)),
    images: { picture_url: '' },
    address: { market, country, street: `${market}, ${country}` },
    review_scores: { review_scores_rating: 80 + (i % 20) },
    amenities: ['Wifi', 'Kitchen', 'Heating', 'Washer', 'Essentials', 'Hair dryer'],
    reviews: withReviews
      ? Array.from({ length: 20 }, (_, r) => ({ _id: `${i}-${r}`, reviewer_name: `Voyageur ${r}`, comments: lorem.repeat(2) }))
      : [],
  };
};

listings.deleteMany({});
for (let start = 0; start < count; start += 1000) {
  listings.insertMany(Array.from({ length: Math.min(1000, count - start) }, (_, k) => listing(start + k)));
}
print(`seeded ${listings.countDocuments()} listings`);
