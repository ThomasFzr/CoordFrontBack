package fr.medislot.geo;

import static org.junit.jupiter.api.Assertions.*;

import fr.medislot.api.DirectoryController;
import fr.medislot.api.DirectoryController.ProfessionalDto;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * La vraie chaîne sur l'image du projet (postgres:18) : migrations V1 et V2, données de démonstration, requête
 * JPQL de la boîte, filtre Java, tri. Des lieux réels : la place Bellecour et les cabinets géocodés.
 */
@SpringBootTest
@Testcontainers(disabledWithoutDocker = true)
class NearbyPostgresTest {
  @Container static PostgreSQLContainer db = new PostgreSQLContainer("postgres:18");

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", db::getJdbcUrl);
    r.add("spring.datasource.username", db::getUsername);
    r.add("spring.datasource.password", db::getPassword);
  }

  static final List<String> SIX_AROUND_BELLECOUR = List.of("Dr Amel Benali", "Dr Hugo Petit", "Dr Julie Fabre",
      "Dr Marc Roussel", "Dr Nicolas Garnier", "Dr Claire Vidal");

  @Autowired DirectoryController directory;

  List<ProfessionalDto> around(double lat, double lon, String specialty) {
    return directory.search(specialty, "", "", 0, 50, lat, lon, null).items();
  }

  @Test
  void findsTheSixLyonPractitionersAroundBellecourNearestFirst() {
    List<ProfessionalDto> found = around(45.7576, 4.8317, "");
    assertEquals(SIX_AROUND_BELLECOUR, found.stream().map(ProfessionalDto::name).toList());
    assertEquals(List.of(0.2, 1.2, 2.0, 2.0, 2.2, 3.8), found.stream().map(ProfessionalDto::distanceKm).toList());
  }

  @Test
  void oullinsIsInTheBoxButOutsideTheCircle() {
    var names = around(45.7576, 4.8317, "").stream().map(ProfessionalDto::name).toList();
    assertFalse(names.contains("Dr Sophie Lambert"));
    var wider = directory.search("", "", "", 0, 50, 45.7576, 4.8317, 6.0).items();
    assertEquals("Dr Sophie Lambert", wider.getLast().name());
    assertEquals(5.2, wider.getLast().distanceKm());
  }

  @Test
  void cardiologyAroundBellecour() {
    assertEquals(List.of("Dr Marc Roussel", "Dr Claire Vidal"),
        around(45.7576, 4.8317, "cardiology").stream().map(ProfessionalDto::name).toList());
  }

  @Test
  void parisAndNullIsland() {
    assertEquals(3, around(48.8663, 2.3685, "").size()); // avenue de la République : les trois cabinets parisiens
    assertEquals(0, around(0, 0, "").size()); // golfe de Guinée : aucun praticien, et c'est voulu
  }
}
