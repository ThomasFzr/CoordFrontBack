-- Profil « postgis » seulement (spring.flyway.locations ajoute db/postgis). Image postgis/postgis:18-3.6.
CREATE EXTENSION IF NOT EXISTS postgis;

-- Colonne calculée : toujours à jour avec latitude/longitude, jamais écrite par l'application.
-- ST_MakePoint(x, y) : LONGITUDE d'abord, puis latitude.
ALTER TABLE professional ADD COLUMN location geography(Point, 4326)
  GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED;

-- Index spatial : ST_DWithin s'en sert pour écarter les cabinets lointains (la « boîte », faite par la base).
CREATE INDEX professional_location_gix ON professional USING GIST (location);
