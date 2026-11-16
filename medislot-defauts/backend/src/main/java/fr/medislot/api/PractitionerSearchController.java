package fr.medislot.api;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/praticiens")
public class PractitionerSearchController {

    private static final Logger log = LoggerFactory.getLogger(PractitionerSearchController.class);
    private static final Pattern NOM_VALIDE = Pattern.compile("^[a-zA-Zéèêàï ]*$");

    private final JdbcTemplate jdbc;
    private int nbRecherches = 0;

    public PractitionerSearchController(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @GetMapping("/recherche")
    public List<Map<String, Object>> rechercher(@RequestParam(defaultValue = "") String nom,
                                               @RequestParam(required = false) String ville,
                                               @RequestParam(required = false) String specialite) {
        nbRecherches++;
        log.info("Recherche praticien nom=" + nom + " ville=" + ville);
        if (!NOM_VALIDE.matcher(nom).matches()) {
            return new ArrayList<>();
        }
        // S2077 : les saisies sont des paramètres de la requête (?), jamais du SQL concaténé.
        StringBuilder sql = new StringBuilder("SELECT id, name, specialty, city, address, fee FROM professional WHERE lower(name) LIKE ?");
        List<Object> parametres = new ArrayList<>();
        parametres.add("%" + nom.toLowerCase() + "%");
        if (ville != null && !ville.isBlank()) {
            sql.append(" AND lower(city) = ?");
            parametres.add(ville.trim().toLowerCase());
        }
        if (specialite != null && !specialite.isBlank()) {
            sql.append(" AND specialty = ?");
            parametres.add(specialite.trim());
        }
        List<Map<String, Object>> resultats = jdbc.queryForList(sql.append(" ORDER BY name LIMIT 50").toString(), parametres.toArray());
        List<Map<String, Object>> sortie = new ArrayList<>();
        for (Map<String, Object> ligne : resultats) {
            Map<String, Object> m = new HashMap<>();
            m.put("id", ligne.get("id"));
            m.put("nom", ligne.get("name"));
            m.put("specialite", ligne.get("specialty"));
            m.put("ville", ligne.get("city"));
            m.put("adresse", ligne.get("address"));
            m.put("tarif", ligne.get("fee"));
            sortie.add(m);
        }
        return sortie;
    }

    @GetMapping("/compteur")
    public int compteur() {
        return nbRecherches;
    }
}
