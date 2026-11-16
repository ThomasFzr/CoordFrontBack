package fr.medislot.api;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import fr.medislot.document.ConvocationService;
import fr.medislot.document.ConvocationService.Convocation;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

/** Le contrat HTTP : quatre en-têtes au succès, ProblemDetail aux refus. */
class ConvocationControllerTest {
  static final byte[] PDF = "%PDF-1.7 test".getBytes();
  ConvocationService service = mock(ConvocationService.class);
  MockMvc mvc;
  UsernamePasswordAuthenticationToken patient =
      new UsernamePasswordAuthenticationToken("patient@medislot.test", null);

  @BeforeEach
  void setup() {
    mvc = MockMvcBuilders.standaloneSetup(new ConvocationController(service))
        .setControllerAdvice(new Errors()).build();
  }

  @Test
  void afficheLePdfInlineSansCache() throws Exception {
    when(service.build("patient@medislot.test", 42L)).thenReturn(new Convocation("convocation-rdv-42.pdf", PDF));
    mvc.perform(get("/api/appointments/42/convocation.pdf").principal(patient))
        .andExpect(status().isOk())
        .andExpect(header().string("Content-Type", "application/pdf"))
        .andExpect(header().string("Content-Disposition", "inline; filename=\"convocation-rdv-42.pdf\""))
        .andExpect(header().string("Cache-Control", "no-store"))
        .andExpect(header().longValue("Content-Length", PDF.length))
        .andExpect(content().bytes(PDF));
  }

  @Test
  void proposeLEnregistrementAvecDownloadTrue() throws Exception {
    when(service.build("patient@medislot.test", 42L)).thenReturn(new Convocation("convocation-rdv-42.pdf", PDF));
    mvc.perform(get("/api/appointments/42/convocation.pdf").param("download", "true").principal(patient))
        .andExpect(status().isOk())
        .andExpect(header().string("Content-Disposition", "attachment; filename=\"convocation-rdv-42.pdf\""))
        .andExpect(header().string("Cache-Control", "no-store"));
  }

  @Test
  void repond404EnProblemDetailPourLeRendezVousDUnAutre() throws Exception {
    when(service.build("patient@medislot.test", 43L))
        .thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "Rendez-vous introuvable."));
    mvc.perform(get("/api/appointments/43/convocation.pdf")
            .header("Accept", "application/pdf, application/problem+json").principal(patient))
        .andExpect(status().isNotFound())
        .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
        .andExpect(jsonPath("$.status").value(404))
        .andExpect(jsonPath("$.detail").value("Rendez-vous introuvable."));
  }

  @Test
  void repond409EnProblemDetailPourUnRendezVousAnnule() throws Exception {
    when(service.build("patient@medislot.test", 42L))
        .thenThrow(new ResponseStatusException(HttpStatus.CONFLICT, "Ce rendez-vous est annulé : il n’a plus de convocation."));
    mvc.perform(get("/api/appointments/42/convocation.pdf")
            .header("Accept", "application/pdf, application/problem+json").principal(patient))
        .andExpect(status().isConflict())
        .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
        .andExpect(jsonPath("$.status").value(409))
        .andExpect(jsonPath("$.detail").value("Ce rendez-vous est annulé : il n’a plus de convocation."));
  }
}
