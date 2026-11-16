package fr.medislot.api;

import fr.medislot.domain.AppUser;
import fr.medislot.repository.UserRepository;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/compte")
public class AccountRecoveryController {

    private static final Logger LOG = LoggerFactory.getLogger(AccountRecoveryController.class);
    private static final SecureRandom HASARD = new SecureRandom();
    private static final Duration VALIDITE = Duration.ofMinutes(15);
    private static final int LONGUEUR_MIN = 12;
    public static final String MESSAGE_OUBLI =
            "Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé.";

    record Demande(String email, Instant expire) {}

    // Jetons à usage unique, valables 15 minutes. Ni la réponse HTTP ni les journaux ne contiennent le jeton :
    // il ne doit partir que par e-mail (aucun service d'envoi dans ce projet de formation).
    private final Map<String, Demande> jetons = new ConcurrentHashMap<>();
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final Clock horloge;

    @Autowired
    public AccountRecoveryController(UserRepository users, PasswordEncoder encoder) {
        this(users, encoder, Clock.systemUTC());
    }

    public AccountRecoveryController(UserRepository users, PasswordEncoder encoder, Clock horloge) {
        this.users = users;
        this.encoder = encoder;
        this.horloge = horloge;
    }

    @PostMapping("/oubli")
    public ResponseEntity<Map<String, Object>> motDePasseOublie(@RequestBody Map<String, String> corps) {
        // Même réponse que le compte existe ou non : l'API ne permet pas de deviner les adresses inscrites.
        String email = corps.getOrDefault("email", "").strip().toLowerCase(Locale.ROOT);
        users.findByEmail(email).ifPresent(u -> emettreJeton(u.email));
        Map<String, Object> reponse = new LinkedHashMap<>();
        reponse.put("message", MESSAGE_OUBLI);
        return ResponseEntity.ok(reponse);
    }

    // Public pour les tests : c'est ce jeton qu'un service d'e-mail enverrait.
    public String emettreJeton(String email) {
        byte[] octets = new byte[32];
        HASARD.nextBytes(octets);
        String jeton = Base64.getUrlEncoder().withoutPadding().encodeToString(octets);
        jetons.put(jeton, new Demande(email, horloge.instant().plus(VALIDITE)));
        LOG.info("Demande de réinitialisation de mot de passe enregistrée");
        return jeton;
    }

    @PostMapping("/reinitialiser")
    public ResponseEntity<Map<String, Object>> reinitialiser(@RequestBody Map<String, String> corps) {
        String jeton = corps.getOrDefault("jeton", "");
        String nouveau = corps.getOrDefault("nouveauMotDePasse", "");
        Map<String, Object> reponse = new LinkedHashMap<>();
        if (nouveau.length() < LONGUEUR_MIN) {
            reponse.put("ok", false);
            reponse.put("message", "Le mot de passe doit contenir au moins " + LONGUEUR_MIN + " caractères.");
            return ResponseEntity.badRequest().body(reponse);
        }
        Demande demande = jetons.remove(jeton); // usage unique
        Optional<AppUser> compte = Optional.ofNullable(demande)
                .filter(d -> horloge.instant().isBefore(d.expire()))
                .flatMap(d -> users.findByEmail(d.email()));
        if (compte.isEmpty()) {
            reponse.put("ok", false);
            reponse.put("message", "Ce lien de réinitialisation est invalide ou a expiré.");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(reponse);
        }
        AppUser u = compte.get();
        u.password = encoder.encode(nouveau);
        users.save(u);
        LOG.info("Mot de passe réinitialisé pour le compte {}", u.id);
        reponse.put("ok", true);
        reponse.put("message", "Mot de passe modifié. Vous pouvez vous connecter.");
        return ResponseEntity.ok(reponse);
    }

    // Redirection ouverte corrigée : seul un chemin interne à l'application est accepté.
    @GetMapping("/suite")
    public void apresConnexion(@RequestParam(defaultValue = "/") String next, HttpServletResponse response) throws IOException {
        response.sendRedirect(cheminInterne(next));
    }

    public static String cheminInterne(String next) {
        if (next == null || !next.startsWith("/") || next.startsWith("//") || next.contains("\\")
                || next.chars().anyMatch(Character::isISOControl)) {
            return "/";
        }
        return next;
    }
}
