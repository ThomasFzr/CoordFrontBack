package fr.medislot.api;

import fr.medislot.domain.AppUser;
import fr.medislot.repository.UserRepository;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.LinkedHashMap;
import java.util.Map;
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

@RestController
@RequestMapping("/api/patients")
public class ProfileController {

    private static final String DOSSIER_AVATARS = System.getProperty("java.io.tmpdir") + "/medislot-avatars/";

    private final UserRepository users;

    public ProfileController(UserRepository users) {
        this.users = users;
    }

    @GetMapping("/{id}")
    public AppUser profil(@PathVariable Long id) {
        return users.findById(id).get();
    }

    @PutMapping("/{id}")
    public AppUser modifier(@PathVariable Long id, @RequestBody AppUser maj) {
        AppUser u = users.findById(id).get();
        if (maj.name != null) u.name = maj.name;
        if (maj.email != null) u.email = maj.email;
        if (maj.role != null) u.role = maj.role;
        if (maj.password != null) u.password = maj.password;
        return users.save(u);
    }

    @PostMapping("/{id}/avatar")
    public Map<String, Object> envoyerAvatar(@PathVariable Long id, @RequestParam("fichier") MultipartFile fichier) throws Exception {
        new File(DOSSIER_AVATARS).mkdirs();
        File cible = new File(DOSSIER_AVATARS + id + "-" + fichier.getOriginalFilename());
        InputStream entree = fichier.getInputStream();
        FileOutputStream sortie = new FileOutputStream(cible);
        entree.transferTo(sortie);
        sortie.close();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("chemin", cible.getAbsolutePath());
        m.put("taille", fichier.getSize());
        m.put("url", "/api/patients/" + id + "/avatar?fichier=" + id + "-" + fichier.getOriginalFilename());
        return m;
    }

    @GetMapping("/{id}/avatar")
    public ResponseEntity<byte[]> lireAvatar(@PathVariable Long id, @RequestParam String fichier) throws Exception {
        byte[] contenu = Files.readAllBytes(new File(DOSSIER_AVATARS + fichier).toPath());
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM).body(contenu);
    }
}
