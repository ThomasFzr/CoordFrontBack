-- Géolocalisation des cabinets (adresses professionnelles, publiques).
-- WGS 84 (EPSG:4326), degrés décimaux. NULL = cabinet non géocodé : il n'apparaît pas dans la recherche par position.
-- Aucune colonne, aucune table pour la position du patient : elle sert à la requête, puis elle est oubliée.
ALTER TABLE professional
  ADD COLUMN latitude  DOUBLE PRECISION,
  ADD COLUMN longitude DOUBLE PRECISION,
  ADD CONSTRAINT professional_latitude_range  CHECK (latitude  BETWEEN -90  AND 90),
  ADD CONSTRAINT professional_longitude_range CHECK (longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT professional_position_both_or_none CHECK ((latitude IS NULL) = (longitude IS NULL));

-- La boîte englobante filtre « latitude entre A et B, longitude entre C et D » : un B-tree suffit.
CREATE INDEX professional_lat_lon_idx ON professional (latitude, longitude);

-- Positions des cabinets de démonstration déjà en base (volumes créés avant cette migration).
-- Géocodées avec la Géoplateforme (data.geopf.fr/geocodage/search) le 16/11/2026. Ordre ici : latitude, longitude.
UPDATE professional SET latitude = 48.866270, longitude =  2.368460 WHERE name = 'Dr Sarah Martin' AND latitude IS NULL;
UPDATE professional SET latitude = 48.848741, longitude =  2.328502 WHERE name = 'Dr Thomas Leroy' AND latitude IS NULL;
UPDATE professional SET latitude = 45.755824, longitude =  4.832967 WHERE name = 'Dr Amel Benali'  AND latitude IS NULL;
UPDATE professional SET latitude = 45.763688, longitude =  4.844596 WHERE name = 'Dr Hugo Petit'   AND latitude IS NULL;
UPDATE professional SET latitude = 48.849573, longitude =  2.354712 WHERE name = 'Dr Léa Moreau'   AND latitude IS NULL;
UPDATE professional SET latitude = 44.845538, longitude = -0.577462 WHERE name = 'Dr Inès Diallo'  AND latitude IS NULL;
