package fr.medislot.geo;

/**
 * Plus petit rectangle de latitudes et de longitudes qui contient le cercle de recherche.
 * Il sert de filtre grossier indexé ; le cercle exact est tranché ensuite par {@link GeoDistance}.
 */
public record BoundingBox(double minLat, double maxLat, double minLon, double maxLon) {

  public static BoundingBox around(double lat, double lon, double radiusKm) {
    double angular = radiusKm / GeoDistance.EARTH_RADIUS_KM; // rayon en radians sur la sphère
    double dLat = Math.toDegrees(angular); // un degré de latitude vaut toujours ~111,2 km
    double minLat = lat - dLat;
    double maxLat = lat + dLat;

    // Pôle dans le cercle : toutes les longitudes y passent.
    if (minLat <= -90 || maxLat >= 90) {
      return new BoundingBox(Math.max(minLat, -90), Math.min(maxLat, 90), -180, 180);
    }

    // Un degré de longitude rétrécit avec cos(latitude) : la boîte est plus large en degrés qu'haute.
    // asin(sin(r)/cos(φ)) est la demi-largeur exacte du cercle (≈ r / cos φ pour un petit rayon).
    double dLon = Math.toDegrees(Math.asin(Math.sin(angular) / Math.cos(Math.toRadians(lat))));
    double minLon = lon - dLon;
    double maxLon = lon + dLon;

    // Antiméridien (±180°) traversé : on élargit à toutes les longitudes. La boîte reste un sur-ensemble
    // du cercle, et le filtre exact en Java écarte le surplus. Rare (Pacifique), donc pas d'optimisation.
    if (minLon < -180 || maxLon > 180) {
      return new BoundingBox(minLat, maxLat, -180, 180);
    }
    return new BoundingBox(minLat, maxLat, minLon, maxLon);
  }

  public boolean contains(double lat, double lon) {
    return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
  }
}
