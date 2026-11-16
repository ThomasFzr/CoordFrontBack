package fr.medislot.geo;

import fr.medislot.repository.ProfessionalRepository;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Défaut de MediSlot (image postgres:18, sans extension) : la base filtre la boîte englobante grâce à l'index
 * (latitude, longitude), Java mesure les quelques lignes restantes et écarte les coins de la boîte.
 */
@Component
@Profile("!postgis")
public class BoxNearbyFinder implements NearbyFinder {
  private final ProfessionalRepository professionals;

  public BoxNearbyFinder(ProfessionalRepository professionals) {
    this.professionals = professionals;
  }

  @Override
  public List<Nearby> find(NearbyQuery q) {
    BoundingBox box = BoundingBox.around(q.lat(), q.lon(), q.radiusKm());
    return professionals.findInBox(q.specialty(), box.minLat(), box.maxLat(), box.minLon(), box.maxLon())
        .stream()
        .map(p -> new Nearby(p, GeoDistance.haversineKm(q.lat(), q.lon(), p.latitude, p.longitude)))
        .filter(n -> n.distanceKm() <= q.radiusKm()) // coins de la boîte : jusqu'à r × √2 sans ce filtre
        .toList();
  }
}
