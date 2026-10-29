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
    private static final Pattern NOM_VALIDE = Pattern.compile("^([a-zA-Zéèêàï ]+\\s?)*$");

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
        String filtre = null;
        if (specialite != null && !specialite.isBlank()) {
            filtre = specialite.trim();
        }
        int longueurFiltre = filtre.length();
        String filtreVille = "";
        if (ville != null && ville.length() > 0) {
            filtreVille = " AND lower(city) = '" + ville.toLowerCase() + "'";
        }
        String filtreSpecialite = longueurFiltre > 0 ? " AND specialty = '" + filtre + "'" : "";
        List<Map<String, Object>> resultats = jdbc.queryForList(
                "SELECT id, name, specialty, city, address, fee FROM professional WHERE lower(name) LIKE '%"
                        + nom.toLowerCase() + "%'" + filtreVille + filtreSpecialite + " ORDER BY name LIMIT 50");
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
