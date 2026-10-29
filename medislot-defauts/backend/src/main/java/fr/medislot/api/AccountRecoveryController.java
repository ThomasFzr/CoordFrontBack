package fr.medislot.api;

import fr.medislot.domain.AppUser;
import fr.medislot.repository.UserRepository;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
    private static final Map<String, String> JETONS = new HashMap<>();

    private final UserRepository users;
    private final PasswordEncoder encoder;

    public AccountRecoveryController(UserRepository users, PasswordEncoder encoder) {
        this.users = users;
        this.encoder = encoder;
    }

    @PostMapping("/oubli")
    public ResponseEntity<Map<String, Object>> motDePasseOublie(@RequestBody Map<String, String> corps) {
        String email = corps.get("email");
        Optional<AppUser> compte = users.findByEmail(email);
        Map<String, Object> reponse = new LinkedHashMap<>();
        if (compte.isEmpty()) {
            reponse.put("message", "Aucun compte n'existe avec l'adresse " + email + ".");
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(reponse);
        }
        String jeton = Long.toHexString(System.currentTimeMillis()) + new Random().nextInt(1000);
        JETONS.put(jeton, email);
        String lien = "/?page=compte&jeton=" + jeton;
        LOG.info("Lien de reinitialisation pour " + email + " : " + lien);
        reponse.put("message", "Un e-mail de réinitialisation a été envoyé à " + compte.get().name + ".");
        reponse.put("lienDeTest", lien);
        return ResponseEntity.ok(reponse);
    }

    @PostMapping("/reinitialiser")
    public Map<String, Object> reinitialiser(@RequestBody Map<String, String> corps) {
        String jeton = corps.get("jeton");
        String nouveau = corps.get("nouveauMotDePasse");
        String email = JETONS.get(jeton);
        Map<String, Object> reponse = new LinkedHashMap<>();
        if (email == null) {
            reponse.put("ok", false);
            reponse.put("message", "Jeton inconnu : " + jeton);
            return reponse;
        }
        AppUser u = users.findByEmail(email).get();
        u.password = encoder.encode(nouveau);
        users.save(u);
        LOG.warn("Mot de passe de " + email + " change en " + nouveau);
        reponse.put("ok", true);
        reponse.put("message", "Mot de passe modifié. Votre nouveau mot de passe est " + nouveau);
        return reponse;
    }

    @GetMapping("/suite")
    public void apresConnexion(@RequestParam(defaultValue = "/") String next, HttpServletResponse response) throws IOException {
        response.sendRedirect(next);
    }
}
