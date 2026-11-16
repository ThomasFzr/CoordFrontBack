package fr.medislot.geo;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

/**
 * Chaque valeur attendue vient d'une source indépendante du code testé (valeur publiée, PostGIS, géométrie),
 * jamais de la sortie de haversineKm elle-même. Tolérance explicite : deux calculs justes diffèrent aux derniers chiffres.
 */
class GeoDistanceTest {
  static final double BELLECOUR_LAT = 45.7576, BELLECOUR_LON = 4.8317;

  @Test
  void matchesTheRosettaCodeReferenceForNashvilleToLosAngeles() {
    // Rosetta Code, « Haversine formula » : BNA -> LAX, R = 6 371 km, 2 886,444 km.
    double km = GeoDistance.haversineKm(36.12, -86.67, 33.94, -118.40);
    assertEquals(2886.444, km, 0.001);
  }

  @Test
  void bellecourToParisRepubliqueIsWithinHalfAPercentOfTheEllipsoid() {
    // Référence : ST_Distance sur geography (ellipsoïde WGS 84), PostGIS 3.6 : 392,549 km (cours, p. 19).
    double km = GeoDistance.haversineKm(BELLECOUR_LAT, BELLECOUR_LON, 48.8663, 2.3685);
    assertEquals(392.549, km, 392.549 * 0.005);
  }

  @Test
  void oneDegreeOfLatitudeIsAbout111Km() {
    // Géométrie : arc de 1° sur un méridien = π × R / 180 = 111,195 km.
    assertEquals(Math.PI * 6371 / 180, GeoDistance.haversineKm(45, 4.8, 46, 4.8), 1e-9);
  }

  @Test
  void samePointIsZeroAndDistanceIsSymmetric() {
    assertEquals(0, GeoDistance.haversineKm(BELLECOUR_LAT, BELLECOUR_LON, BELLECOUR_LAT, BELLECOUR_LON), 1e-12);
    double ab = GeoDistance.haversineKm(BELLECOUR_LAT, BELLECOUR_LON, 45.755824, 4.832967);
    double ba = GeoDistance.haversineKm(45.755824, 4.832967, BELLECOUR_LAT, BELLECOUR_LON);
    assertEquals(ab, ba, 1e-12);
  }

  @Test
  void antipodesGiveHalfTheCircumferenceWithoutNaN() {
    // √h peut dépasser 1 d'un epsilon : sans min(1, …), asin renvoie NaN. Demi-circonférence : π × R.
    double km = GeoDistance.haversineKm(45.7576, 4.8317, -45.7576, -175.1683);
    assertFalse(Double.isNaN(km));
    assertEquals(Math.PI * 6371, km, 0.01);
  }

  @Test
  void swappingLatitudeAndLongitudeGivesAWrongAnswer() {
    // Le bug de la bande dessinée : Bellecour -> cabinet de la rue de la Charité, à environ 200 m.
    double right = GeoDistance.haversineKm(BELLECOUR_LAT, BELLECOUR_LON, 45.755824, 4.832967);
    double swapped = GeoDistance.haversineKm(BELLECOUR_LON, BELLECOUR_LAT, 45.755824, 4.832967);
    assertEquals(0.2, right, 0.05);
    assertTrue(swapped > 5000, "lat et lon inversés : " + swapped + " km, plusieurs milliers de km, sans erreur");
  }

  @Test
  void bellecourToPartDieuIsAboutTwoKilometres() {
    // Bellecour -> Part-Dieu (17 bd Vivier-Merle, Géoplateforme). Degrés passés à sin/cos : des dizaines de km.
    double km = GeoDistance.haversineKm(BELLECOUR_LAT, BELLECOUR_LON, 45.762307, 4.859023);
    assertEquals(2.18, km, 0.02);
  }

  @Test
  void roundsToTheTenthOfAKilometre() {
    assertEquals(2.3, GeoDistance.roundKm(2.34));
    assertEquals(2.3, GeoDistance.roundKm(2.26));
    assertEquals(0.2, GeoDistance.roundKm(0.221));
    assertEquals(0.0, GeoDistance.roundKm(0.04));
    assertEquals(5.0, GeoDistance.roundKm(4.96));
  }
}
