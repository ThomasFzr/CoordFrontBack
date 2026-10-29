package fr.medislot.api;

import fr.medislot.application.BookingService;
import fr.medislot.domain.Appointment;
import fr.medislot.domain.Professional;
import fr.medislot.domain.Slot;
import fr.medislot.repository.AppointmentRepository;
import fr.medislot.repository.ProfessionalRepository;
import fr.medislot.repository.SlotRepository;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.security.Principal;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/appointments")
public class AppointmentExportController {

    private final BookingService service;
    private final AppointmentRepository appointments;
    private final SlotRepository slots;
    private final ProfessionalRepository professionals;
    private String dernierExport;

    public AppointmentExportController(BookingService service, AppointmentRepository appointments,
                                       SlotRepository slots, ProfessionalRepository professionals) {
        this.service = service;
        this.appointments = appointments;
        this.slots = slots;
        this.professionals = professionals;
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> exporter(Principal principal) throws Exception {
        Long patient = service.patient(principal.getName());
        List<Appointment> liste = appointments.findAll();
        File fichier = File.createTempFile("export-rdv", ".csv");
        FileWriter writer = new FileWriter(fichier);
        String csv = "id;praticien;specialite;ville;date;statut;tarif_ttc\n";
        for (Appointment a : liste) {
            if (a.patientId == patient) {
                Slot s = slots.findById(a.slotId).get();
                Professional p = professionals.findById(s.professionalId).get();
                BigDecimal ttc = new BigDecimal(p.fee * 1.2);
                csv = csv + ligne(a.id, p.name, p.specialty, p.city, s.startsAt.toString(), a.status, ttc.toString(), ";", true);
            }
        }
        writer.write(csv);
        writer.flush();
        dernierExport = new SimpleDateFormat("dd/MM/yyyy HH:mm").format(new Date());
        byte[] contenu = Files.readAllBytes(fichier.toPath());
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=mes-rendez-vous.csv")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(contenu);
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

    @GetMapping("/{id}/fiche")
    public AppointmentController.AppointmentDto fiche(@PathVariable Long id) {
        Appointment a = appointments.findById(id).get();
        Slot s = slots.findById(a.slotId).get();
        Professional p = professionals.findById(s.professionalId).get();
        return new AppointmentController.AppointmentDto(a.id, s.id, p.id, p.name, p.specialty, p.address, p.city, s.startsAt, a.status);
    }

    private void nettoyer(File f) {
        try {
            Files.delete(f.toPath());
        } catch (IOException e) {
        }
    }
}
