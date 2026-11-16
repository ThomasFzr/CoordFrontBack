package fr.medislot.document;

import fr.medislot.domain.AppUser;
import fr.medislot.domain.Appointment;
import fr.medislot.domain.Professional;
import fr.medislot.domain.Slot;
import fr.medislot.repository.AppointmentRepository;
import fr.medislot.repository.ProfessionalRepository;
import fr.medislot.repository.SlotRepository;
import fr.medislot.repository.UserRepository;
import java.time.Clock;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Fabrique la convocation d'un rendez-vous : refuse d'abord (404, 409), fabrique ensuite. */
@Service
public class ConvocationService {
  /** Même message que GET /api/appointments/{id} : un 404 ne dit pas si le rendez-vous existe. */
  static final String NOT_FOUND = "Rendez-vous introuvable.";
  static final String CANCELLED = "Ce rendez-vous est annulé : il n’a plus de convocation.";

  public record Convocation(String filename, byte[] pdf) {}

  private final UserRepository users;
  private final AppointmentRepository appointments;
  private final SlotRepository slots;
  private final ProfessionalRepository professionals;
  private final PdfRenderer renderer;
  private final Clock clock;

  @Autowired
  public ConvocationService(UserRepository users, AppointmentRepository appointments, SlotRepository slots,
                            ProfessionalRepository professionals, PdfRenderer renderer) {
    this(users, appointments, slots, professionals, renderer, Clock.systemUTC());
  }

  ConvocationService(UserRepository users, AppointmentRepository appointments, SlotRepository slots,
                     ProfessionalRepository professionals, PdfRenderer renderer, Clock clock) {
    this.users = users; this.appointments = appointments; this.slots = slots;
    this.professionals = professionals; this.renderer = renderer; this.clock = clock;
  }

  @Transactional(readOnly = true)
  public Convocation build(String email, Long id) {
    // 1. Le patient connecté (Principal fourni par Spring Security).
    AppUser patient = users.findByEmail(email)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Connexion requise"));
    // 2. Son rendez-vous, et seulement le sien : 404, pas 403, pour ne rien avouer (IDOR).
    Appointment a = appointments.findById(id)
        .filter(x -> x.patientId.equals(patient.id))
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND));
    // 3. Un rendez-vous annulé n'a plus de convocation.
    if (!"CONFIRMED".equals(a.status)) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, CANCELLED);
    }
    // 4. Le créneau et le praticien.
    Slot s = slots.findById(a.slotId).orElseThrow();
    Professional p = professionals.findById(s.professionalId).orElseThrow();
    // 5. Valeurs prêtes à afficher, formatées et testées ici, pas dans le modèle.
    var view = new ConvocationView(
        ConvocationFormats.reference(a.id), patient.name, p.name, ConvocationFormats.specialty(p.specialty),
        p.address, p.city, ConvocationFormats.day(s.startsAt), ConvocationFormats.time(s.startsAt),
        ConvocationFormats.issuedOn(clock.instant()));
    // 6. Seulement maintenant, on fabrique.
    return new Convocation(filename(a.id), renderer.render("convocation", Map.of("c", view)));
  }

  /** Nom proposé au navigateur : le numéro du rendez-vous, ni nom, ni spécialité, ni date. */
  static String filename(Long id) { return "convocation-rdv-" + id + ".pdf"; }
}
