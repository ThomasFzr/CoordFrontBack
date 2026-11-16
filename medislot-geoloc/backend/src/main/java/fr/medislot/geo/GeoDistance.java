package fr.medislot.geo;

/**
 * Distance à vol d'oiseau sur une sphère de rayon moyen 6 371 km (formule de haversine).
 * Ce n'est ni une distance par la route, ni un temps de trajet. Écart avec l'ellipsoïde WGS 84 : moins de 0,5 %.
 */
public final class GeoDistance {
  /** Rayon moyen de la Terre (IUGG), en kilomètres : la distance sort dans la même unité. */
  public static final double EARTH_RADIUS_KM = 6371.0;

  private GeoDistance() {}

  /** Ordre : latitude puis longitude, en degrés WGS 84, comme dans le contrat de l'API. Résultat en km. */
  public static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
    // Math.sin et Math.cos attendent des radians : sans conversion, le calcul est faux sans erreur.
    double phi1 = Math.toRadians(lat1);
    double phi2 = Math.toRadians(lat2);
    double dPhi = phi2 - phi1;
    double dLambda = Math.toRadians(lon2 - lon1);
    double h = Math.pow(Math.sin(dPhi / 2), 2)
        + Math.cos(phi1) * Math.cos(phi2) * Math.pow(Math.sin(dLambda / 2), 2);
    // Un arrondi flottant peut donner √h = 1,0000000002 (points antipodaux) : min(1, …) évite un NaN.
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** Arrondi au dixième de kilomètre, pour l'affichage seulement : on trie toujours sur la valeur exacte. */
  public static double roundKm(double km) {
    return Math.round(km * 10) / 10.0;
  }
}
