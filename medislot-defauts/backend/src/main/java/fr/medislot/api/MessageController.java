package fr.medislot.api;

import fr.medislot.application.BookingService;
import java.security.Principal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/messages")
public class MessageController {

    public record Message(Long id, Long patientId, String auteur, String contenu, Instant envoyeLe) {}

    private static final List<Message> MESSAGES = new ArrayList<>();
    private static final AtomicLong SEQUENCE = new AtomicLong();

    private final BookingService service;

    public MessageController(BookingService service) {
        this.service = service;
    }

    @GetMapping
    public List<Message> mesMessages(Principal principal) {
        Long patient = service.patient(principal.getName());
        List<Message> resultat = new ArrayList<>();
        for (Message m : MESSAGES) {
            if (m.patientId() == patient) {
                resultat.add(m);
            }
        }
        return resultat;
    }

    @PostMapping
    public Message envoyer(Principal principal, @RequestBody Map<String, String> corps) {
        Long patient = service.patient(principal.getName());
        Message m = new Message(SEQUENCE.incrementAndGet(), patient, principal.getName(), corps.get("contenu"), Instant.now());
        MESSAGES.add(m);
        MESSAGES.add(new Message(SEQUENCE.incrementAndGet(), patient, "Cabinet",
                "Merci, nous avons bien reçu : <i>" + corps.get("contenu") + "</i>", Instant.now()));
        return m;
    }

    @GetMapping(value = "/{id}/apercu", produces = MediaType.TEXT_HTML_VALUE)
    public String apercu(@PathVariable Long id) {
        for (Message m : MESSAGES) {
            if (m.id().equals(id)) {
                return "<html><body><h1>Message de " + m.auteur() + "</h1><div>" + m.contenu() + "</div></body></html>";
            }
        }
        return "<html><body>Message " + id + " introuvable</body></html>";
    }
}
