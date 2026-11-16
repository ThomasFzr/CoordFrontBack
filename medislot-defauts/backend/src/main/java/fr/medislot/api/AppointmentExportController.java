package fr.medislot.api;

import fr.medislot.application.BookingService;
import fr.medislot.domain.Appointment;
import fr.medislot.domain.Professional;
import fr.medislot.domain.Slot;
import fr.medislot.repository.AppointmentRepository;
import fr.medislot.repository.ProfessionalRepository;
import fr.medislot.repository.SlotRepository;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/appointments")
public class AppointmentExportController {

    private final BookingService service;
    private final AppointmentRepository appointments;
    private final SlotRepository slots;
    private final ProfessionalRepository professionals;

    public AppointmentExportController(BookingService service, AppointmentRepository appointments,
                                       SlotRepository slots, ProfessionalRepository professionals) {
        this.service = service;
        this.appointments = appointments;
        this.slots = slots;
        this.professionals = professionals;
    }

    // S5443 : le CSV est construit en mémoire ; plus de fichier temporaire dans un dossier partagé.
    @GetMapping("/export")
    public ResponseEntity<byte[]> exporter(Principal principal) {
        Long patient = service.patient(principal.getName());
        StringBuilder csv = new StringBuilder("id;praticien;specialite;ville;date;statut;tarif_ttc\n");
        for (Appointment a : appointments.findAll()) {
            if (patient.equals(a.patientId)) {
                Slot s = slots.findById(a.slotId).orElseThrow();
                Professional p = professionals.findById(s.professionalId).orElseThrow();
                BigDecimal ttc = BigDecimal.valueOf(p.fee).multiply(new BigDecimal("1.2"));
                csv.append(ligne(a.id, p.name, p.specialty, p.city, s.startsAt.toString(), a.status, ttc.toString(), ";", true));
            }
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=mes-rendez-vous.csv")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(csv.toString().getBytes(StandardCharsets.UTF_8));
    }

    private String ligne(Long id, String nom, String specialite, String ville, String date, String statut,
                         String tarif, String separateur, boolean traduire) {
        String spec = specialite;
        String st = statut;
        if (traduire) {
            if (specialite != null) {
                if (specialite.equals("general")) {
                    spec = "Medecine generale";
                } else if (specialite.equals("cardiology")) {
                    spec = "Cardiologie";
                } else if (specialite.equals("dermatology")) {
                    spec = "Dermatologie";
                } else if (specialite.equals("dentistry")) {
                    spec = "Chirurgie dentaire";
                } else {
                    spec = specialite;
                }
            }
            if (statut != null) {
                if (statut.equals("CONFIRMED")) {
                    if (date != null && date.length() > 10) {
                        st = "Confirme le " + date.substring(0, 10);
                    } else {
                        st = "Confirme";
                    }
                } else if (statut.equals("CANCELLED")) {
                    st = "Annule";
                } else {
                    for (int i = 0; i < 3; i++) {
                        if (i == 2) {
                            st = "Inconnu";
                        }
                    }
                }
            }
        }
        if (ville == null || ville.length() == 0) {
            ville = "-";
        }
        return id + separateur + nom + separateur + spec + separateur + ville + separateur + date + separateur + st + separateur + tarif + "\n";
    }

    // Un patient ne lit que la fiche de ses propres rendez-vous ; sinon 404, sans révéler que l'identifiant existe.
    @GetMapping("/{id}/fiche")
    public AppointmentController.AppointmentDto fiche(@PathVariable Long id, Principal principal) {
        Long patient = service.patient(principal.getName());
        Appointment a = appointments.findById(id).filter(r -> patient.equals(r.patientId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Rendez-vous introuvable."));
        Slot s = slots.findById(a.slotId).orElseThrow();
        Professional p = professionals.findById(s.professionalId).orElseThrow();
        return new AppointmentController.AppointmentDto(a.id, s.id, p.id, p.name, p.specialty, p.address, p.city, s.startsAt, a.status);
    }
}
