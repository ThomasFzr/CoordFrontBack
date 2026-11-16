package fr.medislot.api;

import fr.medislot.domain.AppUser;
import fr.medislot.repository.UserRepository;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.Principal;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/patients")
public class ProfileController {

    private static final String DOSSIER_AVATARS = System.getProperty("java.io.tmpdir") + "/medislot-avatars/";

    // S4684 : l'API ne reçoit ni ne renvoie l'entité AppUser. Le profil lu n'expose ni le mot de passe chiffré
    // ni rien d'autre que ces champs, et la modification ne peut toucher ni le rôle ni le mot de passe.
    public record Profil(Long id, String name, String email, String role) {}
    public record ModificationProfil(String name, String email) {}

    private final UserRepository users;

    public ProfileController(UserRepository users) {
        this.users = users;
    }

    @GetMapping("/{id}")
    public Profil profil(@PathVariable Long id, Principal principal) {
        AppUser u = soiMeme(id, principal);
        return new Profil(u.id, u.name, u.email, u.role);
    }

    @PutMapping("/{id}")
    public Profil modifier(@PathVariable Long id, @RequestBody ModificationProfil maj, Principal principal) {
        AppUser u = soiMeme(id, principal);
        if (maj.name() != null && !maj.name().isBlank()) u.name = maj.name().strip();
        if (maj.email() != null && !maj.email().isBlank()) u.email = maj.email().strip().toLowerCase(java.util.Locale.ROOT);
        users.save(u);
        return new Profil(u.id, u.name, u.email, u.role);
    }

    @PostMapping("/{id}/avatar")
    public Map<String, Object> envoyerAvatar(@PathVariable Long id, @RequestParam("fichier") MultipartFile fichier,
                                             Principal principal) throws Exception {
        soiMeme(id, principal);
        new File(DOSSIER_AVATARS).mkdirs();
        String nom = id + "-" + nomSimple(fichier.getOriginalFilename());
        File cible = new File(DOSSIER_AVATARS + nom);
        try (InputStream entree = fichier.getInputStream(); FileOutputStream sortie = new FileOutputStream(cible)) {
            entree.transferTo(sortie);
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("taille", fichier.getSize());
        m.put("url", "/api/patients/" + id + "/avatar?fichier=" + nom);
        return m;
    }

    @GetMapping("/{id}/avatar")
    public ResponseEntity<byte[]> lireAvatar(@PathVariable Long id, @RequestParam String fichier, Principal principal) throws Exception {
        soiMeme(id, principal);
        byte[] contenu = Files.readAllBytes(new File(DOSSIER_AVATARS + nomSimple(fichier)).toPath());
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM).body(contenu);
    }

    // Un patient ne lit et ne modifie que son propre profil.
    private AppUser soiMeme(Long id, Principal principal) {
        AppUser u = users.findByEmail(principal.getName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Connexion requise."));
        if (!u.id.equals(id)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Ce profil n'est pas le vôtre.");
        return u;
    }

    // Garde seulement le nom du fichier : « ../../etc/passwd » devient « passwd ».
    private static String nomSimple(String nom) {
        Path p = Path.of(nom == null || nom.isBlank() ? "avatar" : nom).getFileName();
        return p == null ? "avatar" : p.toString();
    }
}
