// Fixture fictive au format de sample_airbnb.listingsAndReviews, chargée par mongosh en CI.
const listings = db.getSiblingDB('sample_airbnb').listingsAndReviews;
const countries = [['Porto', 'Portugal'], ['Barcelona', 'Spain'], ['Montreal', 'Canada'], ['Sydney', 'Australia']];
const types = ['Apartment', 'House', 'Loft'];

listings.deleteMany({});
listings.insertMany(
  Array.from({ length: 45 }, (_, i) => {
    const [market, country] = countries[i % countries.length];
    return {
      _id: `ci-${String(i + 1).padStart(3, '0')}`,
      name: `Logement CI ${i + 1}`,
      summary: 'Annonce fictive utilisée par la CI.',
      property_type: types[i % types.length],
      room_type: 'Entire home/apt',
      accommodates: 2 + (i % 4),
      bedrooms: 1 + (i % 3),
      beds: 1 + (i % 3),
      price: NumberDecimal(String(40 + i * 5)),
      images: { picture_url: '' },
      address: { market, country, street: `${market}, ${country}` },
      review_scores: { review_scores_rating: 80 + (i % 20) },
      amenities: ['Wifi', 'Kitchen'],
      reviews: [],
    };
  }),
);
print(`seeded ${listings.countDocuments()} listings`);
