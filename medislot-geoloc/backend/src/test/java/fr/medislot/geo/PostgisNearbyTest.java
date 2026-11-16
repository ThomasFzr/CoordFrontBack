package fr.medislot.geo;

import static org.junit.jupiter.api.Assertions.*;

import fr.medislot.repository.ProfessionalRepository;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/** Défi : la même recherche faite par PostGIS (profil « postgis », image postgis/postgis:18-3.6). */
@SpringBootTest
@ActiveProfiles("postgis")
@Testcontainers(disabledWithoutDocker = true)
class PostgisNearbyTest {
  @Container static PostgreSQLContainer db = new PostgreSQLContainer(
      DockerImageName.parse("postgis/postgis:18-3.6").asCompatibleSubstituteFor("postgres"));

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", db::getJdbcUrl);
    r.add("spring.datasource.username", db::getUsername);
    r.add("spring.datasource.password", db::getPassword);
  }

  @Autowired NearbyFinder finder;
  @Autowired NearbyService service;
  @Autowired ProfessionalRepository professionals;
  @Autowired JdbcTemplate jdbc;
  @Autowired TransactionTemplate tx;

  static final NearbyQuery BELLECOUR = NearbyQuery.of(45.7576, 4.8317, null, "", 0, 50);

  @Test
  void findsTheSameSixPractitionersAsTheBox() {
    assertInstanceOf(PostgisNearbyFinder.class, finder);
    List<String> postgis = service.search(BELLECOUR).items().stream().map(n -> n.professional().name).toList();
    List<String> box = tx.execute(s -> new BoxNearbyFinder(professionals).find(BELLECOUR).stream()
        .sorted(NearbyService.ORDER).map(n -> n.professional().name).toList());
    assertEquals(NearbyPostgresTest.SIX_AROUND_BELLECOUR, postgis);
    assertEquals(box, postgis);
  }

  @Test
  void ellipsoidAndSphereAgreeWithinHalfAPercent() {
    for (Nearby n : service.search(BELLECOUR).items()) {
      double sphere = GeoDistance.haversineKm(45.7576, 4.8317, n.professional().latitude, n.professional().longitude);
      assertEquals(sphere, n.distanceKm(), sphere * 0.005, n.professional().name);
    }
  }

  @Test
  void theGeneratedColumnPutsLongitudeFirstAndTheIndexServes() {
    var row = jdbc.queryForMap("SELECT latitude, longitude, ST_Y(location::geometry) AS y, ST_X(location::geometry) AS x"
        + " FROM professional WHERE name = 'Dr Amel Benali'");
    assertEquals(row.get("latitude"), row.get("y")); // y = latitude
    assertEquals(row.get("longitude"), row.get("x")); // x = longitude
    // Onze lignes : PostgreSQL préférerait un parcours complet. On l'interdit pour vérifier que l'index est utilisable.
    String plan = tx.execute(s -> {
      jdbc.execute("SET LOCAL enable_seqscan = off");
      return String.join("\n", jdbc.queryForList("EXPLAIN " + PostgisNearbyFinder.SQL
          .replace(":lon", "4.8317").replace(":lat", "45.7576").replace(":meters", "5000")
          .replace(":specialty", "''"), String.class));
    });
    assertTrue(plan.contains("professional_location_gix"), plan);
  }
}
