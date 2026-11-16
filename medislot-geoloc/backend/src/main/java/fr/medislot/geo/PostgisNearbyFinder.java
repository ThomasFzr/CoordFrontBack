package fr.medislot.geo;

import fr.medislot.domain.Professional;
import fr.medislot.repository.ProfessionalRepository;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Profil « postgis » : une seule requête. L'index GiST fait la boîte, ST_DWithin tranche le cercle, ST_Distance
 * mesure sur l'ellipsoïde WGS 84 (en mètres).
 */
@Component
@Profile("postgis")
public class PostgisNearbyFinder implements NearbyFinder {
  /** ST_MakePoint(x, y) : longitude d'abord. */
  static final String SQL = """
      SELECT p.id, ST_Distance(p.location, c.pt) / 1000 AS km
      FROM professional p,
           (SELECT ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography AS pt) c
      WHERE ST_DWithin(p.location, c.pt, :meters)
        AND (:specialty = '' OR p.specialty = :specialty)
      ORDER BY km, p.name, p.id
      """;

  private final NamedParameterJdbcTemplate jdbc;
  private final ProfessionalRepository professionals;

  public PostgisNearbyFinder(NamedParameterJdbcTemplate jdbc, ProfessionalRepository professionals) {
    this.jdbc = jdbc;
    this.professionals = professionals;
  }

  @Override
  public List<Nearby> find(NearbyQuery q) {
    var params = new MapSqlParameterSource()
        .addValue("lat", q.lat())
        .addValue("lon", q.lon())
        .addValue("meters", q.radiusKm() * 1000)
        .addValue("specialty", q.specialty());
    record Hit(long id, double km) {}
    List<Hit> hits = jdbc.query(SQL, params, (rs, i) -> new Hit(rs.getLong("id"), rs.getDouble("km")));
    Map<Long, Professional> byId = professionals.findAllById(hits.stream().map(Hit::id).toList())
        .stream().collect(Collectors.toMap(p -> p.id, Function.identity()));
    return hits.stream().map(h -> new Nearby(byId.get(h.id()), h.km())).toList();
  }
}
