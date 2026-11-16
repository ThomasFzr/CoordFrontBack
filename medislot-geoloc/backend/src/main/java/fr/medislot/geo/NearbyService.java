package fr.medislot.geo;

import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Trie tous les résultats du rayon, puis découpe la page. Ordre total et stable : distance exacte croissante,
 * puis nom, puis id. Deux appels donnent le même ordre, et chaque cabinet n'apparaît que sur une page.
 * Aucun journal dans ce paquet : la position reçue n'est écrite nulle part (GeolocPrivacyTest).
 */
@Service
public class NearbyService {
  static final Comparator<Nearby> ORDER = Comparator.comparingDouble(Nearby::distanceKm)
      .thenComparing(n -> n.professional().name)
      .thenComparing(n -> n.professional().id);

  public record NearbyPage(List<Nearby> items, int page, int size, long total) {}

  private final NearbyFinder finder;

  public NearbyService(NearbyFinder finder) {
    this.finder = finder;
  }

  @Transactional(readOnly = true)
  public NearbyPage search(NearbyQuery q) {
    List<Nearby> all = finder.find(q).stream().sorted(ORDER).toList(); // trier AVANT de découper
    int from = (int) Math.min((long) q.page() * q.size(), all.size());
    int to = Math.min(from + q.size(), all.size());
    return new NearbyPage(all.subList(from, to), q.page(), q.size(), all.size());
  }
}
