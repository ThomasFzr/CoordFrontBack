package fr.medislot.api;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import fr.medislot.domain.Professional;
import fr.medislot.geo.BoxNearbyFinder;
import fr.medislot.geo.NearbyService;
import fr.medislot.repository.ProfessionalRepository;
import fr.medislot.repository.SlotRepository;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.data.domain.PageImpl;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * Le contrat HTTP de la recherche par position, sans base : le dépôt est remplacé par une liste en mémoire qui
 * applique la même boîte que la requête JPQL. BoxNearbyFinder, NearbyService et Errors sont les vrais.
 */
class NearbySearchApiTest {
  static final String BELLECOUR = "lat=45.7576&lon=4.8317";
  ProfessionalRepository repo = mock(ProfessionalRepository.class);
  List<Professional> rows = new ArrayList<>();
  MockMvc mvc;

  static Professional pro(long id, String name, String specialty, Double lat, Double lon) {
    Professional p = new Professional();
    p.id = id; p.name = name; p.specialty = specialty; p.city = "Lyon"; p.address = "adresse fictive";
    p.bio = "fictif"; p.fee = 30; p.latitude = lat; p.longitude = lon;
    return p;
  }

  @BeforeEach
  void setup() {
    rows.addAll(List.of(
        pro(1, "Dr Amel Benali", "dermatology", 45.755824, 4.832967),   // 0,2 km
        pro(2, "Dr Hugo Petit", "general", 45.763688, 4.844596),        // 1,2 km
        pro(3, "Dr Julie Fabre", "dentistry", 45.775336, 4.832017),     // 2,0 km
        pro(4, "Dr Marc Roussel", "cardiology", 45.740085, 4.839350),   // 2,0 km
        pro(5, "Dr Sophie Lambert", "general", 45.714313, 4.805346),    // 5,2 km : coin de la boîte
        pro(6, "Dr Inès Diallo", "general", 44.845538, -0.577462),      // Bordeaux : hors de la boîte
        pro(7, "Dr Sans Adresse", "general", null, null)));             // non géocodé
    when(repo.findInBox(anyString(), anyDouble(), anyDouble(), anyDouble(), anyDouble())).thenAnswer(inv -> {
      String s = inv.getArgument(0);
      double minLat = inv.getArgument(1), maxLat = inv.getArgument(2), minLon = inv.getArgument(3), maxLon = inv.getArgument(4);
      return rows.stream().filter(p -> p.latitude != null
          && p.latitude >= minLat && p.latitude <= maxLat && p.longitude >= minLon && p.longitude <= maxLon
          && (s.isEmpty() || p.specialty.equals(s))).toList();
    });
    var controller = new DirectoryController(repo, mock(SlotRepository.class), new NearbyService(new BoxNearbyFinder(repo)));
    mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new Errors()).build();
  }

  @Test
  void aroundBellecourTheBoxCornerIsExcludedAndTheNearestComesFirst() throws Exception {
    mvc.perform(get("/api/professionals?" + BELLECOUR + "&radiusKm=5"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(4)) // Oullins, dans la boîte à 5,2 km, est écarté
        .andExpect(jsonPath("$.items[*].name").value(contains(
            "Dr Amel Benali", "Dr Hugo Petit", "Dr Julie Fabre", "Dr Marc Roussel")))
        .andExpect(jsonPath("$.items[0].distanceKm").value(0.2))
        .andExpect(jsonPath("$.items[1].distanceKm").value(1.2))
        .andExpect(jsonPath("$.items[0].latitude").value(45.755824))
        .andExpect(jsonPath("$.items[0].longitude").value(4.832967));
  }

  @Test
  void theDefaultRadiusIsFiveKilometres() throws Exception {
    mvc.perform(get("/api/professionals?" + BELLECOUR)).andExpect(jsonPath("$.total").value(4));
    mvc.perform(get("/api/professionals?" + BELLECOUR + "&radiusKm=1.5")).andExpect(jsonPath("$.total").value(2));
    mvc.perform(get("/api/professionals?" + BELLECOUR + "&radiusKm=6")).andExpect(jsonPath("$.total").value(5));
  }

  @Test
  void theSpecialtyFiltersInsideTheRadius() throws Exception {
    mvc.perform(get("/api/professionals?" + BELLECOUR + "&specialty=cardiology"))
        .andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.items[0].name").value("Dr Marc Roussel"));
  }

  @Test
  void theBackSortsEverythingThenCutsThePage() throws Exception {
    mvc.perform(get("/api/professionals?" + BELLECOUR + "&page=1&size=2"))
        .andExpect(jsonPath("$.total").value(4))
        .andExpect(jsonPath("$.page").value(1))
        .andExpect(jsonPath("$.size").value(2))
        .andExpect(jsonPath("$.items[*].name").value(contains("Dr Julie Fabre", "Dr Marc Roussel")));
    mvc.perform(get("/api/professionals?" + BELLECOUR + "&page=9&size=2"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty()).andExpect(jsonPath("$.total").value(4));
  }

  @Test
  void tiesAreOrderedByNameThenId() throws Exception {
    rows.clear();
    rows.addAll(List.of(pro(9, "Dr Zoé", "general", 45.76, 4.84), pro(8, "Dr Anne", "general", 45.76, 4.84),
        pro(3, "Dr Anne", "general", 45.76, 4.84)));
    mvc.perform(get("/api/professionals?" + BELLECOUR))
        .andExpect(jsonPath("$.items[*].id").value(contains(3, 8, 9)));
  }

  @ParameterizedTest(name = "{0} -> {1}")
  @CsvSource(delimiter = '|', value = {
      "lat=95&lon=4.8            | Latitude invalide : entre -90 et 90 degrés.",
      "lat=45.75                 | Indiquez lat et lon ensemble.",
      "lon=4.8                   | Indiquez lat et lon ensemble.",
      "radiusKm=5                | Indiquez lat et lon ensemble.",
      "lat=abc&lon=4.8           | Paramètre invalide : lat.",
      "lat=NaN&lon=4.8           | Latitude invalide : entre -90 et 90 degrés.",
      "lat=45.7&lon=200          | Longitude invalide : entre -180 et 180 degrés.",
      "lat=45.7&lon=Infinity     | Longitude invalide : entre -180 et 180 degrés.",
      "lat=45.7&lon=4.8&radiusKm=30 | Rayon invalide : plus de 0 et au plus 20 km.",
      "lat=45.7&lon=4.8&radiusKm=0  | Rayon invalide : plus de 0 et au plus 20 km.",
      "lat=45.7&lon=4.8&size=0   | 'Pagination invalide : page à partir de 0, size de 1 à 50.'",
      "lat=45.7&lon=4.8&city=Lyon | Recherche par position : city et q ne s'appliquent pas."})
  void outOfBoundsIsA400WithASentence(String query, String detail) throws Exception {
    mvc.perform(get("/api/professionals?" + query))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.detail").value(detail));
    verify(repo, never()).findInBox(anyString(), anyDouble(), anyDouble(), anyDouble(), anyDouble());
  }

  @Test
  void theResponseNeverEchoesTheReceivedPosition() throws Exception {
    String body = mvc.perform(get("/api/professionals?lat=45.7576&lon=4.8317"))
        .andReturn().getResponse().getContentAsString();
    assertThatNot(body, "45.7576");
    assertThatNot(body, "4.8317");
    String error = mvc.perform(get("/api/professionals?lat=95.1234&lon=4.8317"))
        .andReturn().getResponse().getContentAsString();
    assertThatNot(error, "95.1234");
  }

  @Test
  void withoutAPositionTheOriginalSearchIsUnchanged() throws Exception {
    when(repo.search(eq(""), eq("Lyon"), eq(""), any())).thenReturn(new PageImpl<>(List.of(rows.get(0))));
    mvc.perform(get("/api/professionals?city=Lyon"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.items[0].distanceKm").doesNotExist());
    verify(repo, never()).findInBox(anyString(), anyDouble(), anyDouble(), anyDouble(), anyDouble());
  }

  static void assertThatNot(String body, String fragment) {
    org.junit.jupiter.api.Assertions.assertFalse(body.contains(fragment), "la réponse contient " + fragment + " : " + body);
  }
}
