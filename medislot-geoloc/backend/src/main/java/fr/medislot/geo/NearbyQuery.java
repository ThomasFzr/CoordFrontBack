package fr.medislot.geo;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Recherche « autour de » validée. Tout ce qui sort des bornes est refusé en 400, avant la moindre requête SQL,
 * avec une phrase que le front affiche telle quelle.
 *
 * @param lat latitude WGS 84 en degrés décimaux, de -90 à 90
 * @param lon longitude WGS 84 en degrés décimaux, de -180 à 180
 * @param radiusKm rayon en kilomètres, plus de 0 et au plus 20
 */
public record NearbyQuery(double lat, double lon, double radiusKm, String specialty, int page, int size) {
  public static final double DEFAULT_RADIUS_KM = 5;
  public static final double MAX_RADIUS_KM = 20;

  public static NearbyQuery of(Double lat, Double lon, Double radiusKm, String specialty, int page, int size) {
    // 1. Une position, c'est deux nombres : l'un sans l'autre n'a pas de sens.
    if (lat == null || lon == null) {
      throw bad("Indiquez lat et lon ensemble.");
    }
    // 2 et 3. Bornes. Spring convertit « NaN » en Double : toute comparaison avec NaN est fausse, d'où isFinite.
    if (!Double.isFinite(lat) || lat < -90 || lat > 90) {
      throw bad("Latitude invalide : entre -90 et 90 degrés.");
    }
    if (!Double.isFinite(lon) || lon < -180 || lon > 180) {
      throw bad("Longitude invalide : entre -180 et 180 degrés.");
    }
    // 4. Rayon plafonné : sans plafond, radiusKm=20000 demande toute la base.
    double r = radiusKm == null ? DEFAULT_RADIUS_KM : radiusKm;
    if (!Double.isFinite(r) || r <= 0 || r > MAX_RADIUS_KM) {
      throw bad("Rayon invalide : plus de 0 et au plus 20 km.");
    }
    // 5. Pagination et spécialité, mêmes bornes que la recherche d'origine.
    if (page < 0 || size < 1 || size > 50) {
      throw bad("Pagination invalide : page à partir de 0, size de 1 à 50.");
    }
    String s = specialty == null ? "" : specialty;
    if (s.length() > 60) {
      throw bad("Spécialité invalide : 60 caractères au plus.");
    }
    return new NearbyQuery(lat, lon, r, s, page, size);
  }

  private static ResponseStatusException bad(String detail) {
    return new ResponseStatusException(HttpStatus.BAD_REQUEST, detail);
  }
}
