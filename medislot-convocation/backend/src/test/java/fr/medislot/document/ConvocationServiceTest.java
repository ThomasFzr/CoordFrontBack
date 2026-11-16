package fr.medislot.document;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import fr.medislot.domain.AppUser;
import fr.medislot.domain.Appointment;
import fr.medislot.domain.Professional;
import fr.medislot.domain.Slot;
import fr.medislot.repository.AppointmentRepository;
import fr.medislot.repository.ProfessionalRepository;
import fr.medislot.repository.SlotRepository;
import fr.medislot.repository.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;

/** Les règles : le sien seulement (404), confirmé seulement (409), heure de Paris été comme hiver. */
class ConvocationServiceTest {
  UserRepository users = mock(UserRepository.class);
  AppointmentRepository appointments = mock(AppointmentRepository.class);
  SlotRepository slots = mock(SlotRepository.class);
  ProfessionalRepository professionals = mock(ProfessionalRepository.class);
  PdfRenderer renderer = mock(PdfRenderer.class);
  // Horloge fixe : le test ne dépend ni du jour ni du fuseau du poste qui l'exécute.
  Clock clock = Clock.fixed(Instant.parse("2026-11-16T10:00:00Z"), ZoneOffset.UTC);
  ConvocationService service = new ConvocationService(users, appointments, slots, professionals, renderer, clock);
  Appointment appointment = new Appointment();
  Slot slot = new Slot();

  @BeforeEach
  void data() {
    user(1L, "patient@medislot.test", "Hélène Durand");
    user(2L, "autre@medislot.test", "Alex Martin");
    appointment.id = 42L; appointment.patientId = 1L; appointment.slotId = 7L; appointment.status = "CONFIRMED";
    when(appointments.findById(42L)).thenReturn(Optional.of(appointment));
    slot.id = 7L; slot.professionalId = 3L; slot.startsAt = Instant.parse("2026-11-24T08:30:00Z");
    when(slots.findById(7L)).thenReturn(Optional.of(slot));
    var p = new Professional();
    p.id = 3L; p.name = "Dr Thomas Leroy"; p.specialty = "cardiology"; p.address = "42 rue de Rennes"; p.city = "Paris";
    when(professionals.findById(3L)).thenReturn(Optional.of(p));
    when(renderer.render(eq("convocation"), anyMap())).thenReturn(new byte[] {'%', 'P', 'D', 'F'});
  }

  void user(Long id, String email, String name) {
    var u = new AppUser(); u.id = id; u.email = email; u.name = name;
    when(users.findByEmail(email)).thenReturn(Optional.of(u));
  }

  @SuppressWarnings("unchecked")
  ConvocationView renderedView() {
    ArgumentCaptor<Map<String, Object>> data = ArgumentCaptor.forClass(Map.class);
    verify(renderer).render(eq("convocation"), data.capture());
    return (ConvocationView) data.getValue().get("c");
  }

  @Test
  void fabriqueLaConvocationDuProprietaireAvecUnNomNeutre() {
    var c = service.build("patient@medislot.test", 42L);
    assertEquals("convocation-rdv-42.pdf", c.filename());
    assertArrayEquals(new byte[] {'%', 'P', 'D', 'F'}, c.pdf());
    var v = renderedView();
    assertEquals("RDV-42", v.reference());
    assertEquals("Hélène Durand", v.patientName());
    assertEquals("Cardiologie", v.specialty());
    assertEquals("mardi 24 novembre 2026", v.day());
    assertEquals("16 novembre 2026", v.issuedOn());
  }

  @Test
  void unAutrePatientRecoit404EtAucunPdfNEstFabrique() {
    var e = assertThrows(ResponseStatusException.class, () -> service.build("autre@medislot.test", 42L));
    assertEquals(404, e.getStatusCode().value());
    assertEquals(ConvocationService.NOT_FOUND, e.getReason());
    verifyNoInteractions(renderer);
  }

  @Test
  void unRendezVousInexistantRecoitLeMeme404() {
    when(appointments.findById(43L)).thenReturn(Optional.empty());
    var e = assertThrows(ResponseStatusException.class, () -> service.build("patient@medislot.test", 43L));
    assertEquals(404, e.getStatusCode().value());
    assertEquals(ConvocationService.NOT_FOUND, e.getReason());
    verifyNoInteractions(renderer);
  }

  @Test
  void unRendezVousAnnuleRecoit409SansPdf() {
    appointment.status = "CANCELLED";
    var e = assertThrows(ResponseStatusException.class, () -> service.build("patient@medislot.test", 42L));
    assertEquals(409, e.getStatusCode().value());
    assertEquals(ConvocationService.CANCELLED, e.getReason());
    verifyNoInteractions(renderer);
  }

  @Test
  void heureDeParisEnHiver() {
    slot.startsAt = Instant.parse("2026-11-24T08:30:00Z");    // UTC+1
    service.build("patient@medislot.test", 42L);
    assertEquals("9 h 30", renderedView().time());
  }

  @Test
  void heureDeParisEnEte() {
    slot.startsAt = Instant.parse("2026-07-07T07:30:00Z");    // UTC+2
    service.build("patient@medislot.test", 42L);
    var v = renderedView();
    assertEquals("9 h 30", v.time());
    assertEquals("mardi 7 juillet 2026", v.day());
  }
}
