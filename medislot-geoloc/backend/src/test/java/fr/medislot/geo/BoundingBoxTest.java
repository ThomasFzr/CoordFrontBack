package fr.medislot.geo;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class BoundingBoxTest {
  @Test
  void halfSidesAtBellecourMatchTheCourse() {
    // Cours p. 23 : demi-côté 0,0450° de latitude, 0,0644° de longitude à Lyon, pour 5 km.
    BoundingBox box = BoundingBox.around(45.7576, 4.8317, 5);
    assertEquals(0.0450, (box.maxLat() - box.minLat()) / 2, 0.00005);
    assertEquals(0.0644, (box.maxLon() - box.minLon()) / 2, 0.00005);
  }

  @Test
  void containsTheWholeCircleButAlsoItsCorners() {
    BoundingBox box = BoundingBox.around(45.7576, 4.8317, 5);
    // Points du cercle, à 5 km dans les quatre directions et en diagonale : tous dans la boîte.
    for (int bearing = 0; bearing < 360; bearing += 15) {
      double b = Math.toRadians(bearing), d = 5 / GeoDistance.EARTH_RADIUS_KM, p1 = Math.toRadians(45.7576);
      double p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
      double l2 = Math.toRadians(4.8317)
          + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
      assertTrue(box.contains(Math.toDegrees(p2), Math.toDegrees(l2)), "cap " + bearing);
    }
    // Oullins (place Anatole France) : dans la boîte, mais à 5,2 km. C'est le coin que Java écarte.
    assertTrue(box.contains(45.714313, 4.805346));
    assertTrue(GeoDistance.haversineKm(45.7576, 4.8317, 45.714313, 4.805346) > 5);
  }

  @Test
  void aCircleAroundAPoleTakesAllLongitudes() {
    BoundingBox box = BoundingBox.around(89.99, 10, 20);
    assertEquals(90, box.maxLat());
    assertEquals(-180, box.minLon());
    assertEquals(180, box.maxLon());
  }

  @Test
  void crossingTheAntimeridianTakesAllLongitudes() {
    BoundingBox box = BoundingBox.around(-17.7, 179.99, 10); // Fidji
    assertEquals(-180, box.minLon());
    assertEquals(180, box.maxLon());
    assertTrue(box.contains(-17.7, -179.99));
  }
}
