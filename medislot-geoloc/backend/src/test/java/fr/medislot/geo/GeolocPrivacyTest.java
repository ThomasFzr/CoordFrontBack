package fr.medislot.geo;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * La position du patient sert à la requête, puis elle est oubliée. Ces règles sont protégées par des tests,
 * pas par la bonne volonté : un log.info de débogage ou un format nginx par défaut les ferait échouer.
 */
class GeolocPrivacyTest {
  static final Path GEO_SOURCES = Path.of("src/main/java/fr/medislot/geo");
  static final Path NGINX = Path.of("../frontend/nginx.conf");

  @Test
  void theGeoPackageNeverLogs() throws IOException {
    try (Stream<Path> files = Files.list(GEO_SOURCES)) {
      for (Path f : files.toList()) {
        String src = Files.readString(f);
        for (String forbidden : List.of("Logger", "LoggerFactory", "@Slf4j", "System.out", "System.err", "printStackTrace")) {
          assertFalse(src.contains(forbidden), f + " contient " + forbidden + " : la position finirait dans les journaux");
        }
      }
    }
  }

  @Test
  void nginxLogsThePathWithoutTheQueryString() throws IOException {
    String conf = Files.readString(NGINX);
    Matcher format = Pattern.compile("log_format\\s+(\\w+)([^;]*);").matcher(conf);
    assertTrue(format.find(), "nginx.conf doit définir un log_format");
    String name = format.group(1), pattern = format.group(2);
    for (String leak : List.of("$request ", "$request\"", "$request'", "$request_uri", "$args", "$query_string", "$arg_")) {
      assertFalse(pattern.contains(leak), "log_format " + name + " journalise " + leak.trim());
    }
    assertTrue(pattern.contains("$uri"), "le chemin reste utile pour diagnostiquer");
    // Le format est utilisé là où passent les recherches, et aucun autre access_log ne journalise /api/.
    Matcher api = Pattern.compile("location\\s+/api/\\s*\\{([^}]*)}").matcher(conf);
    assertTrue(api.find(), "location /api/ introuvable");
    assertTrue(api.group(1).matches("(?s).*access_log\\s+\\S+\\s+" + name + "\\s*;.*"), "location /api/ doit utiliser " + name);
    Matcher every = Pattern.compile("access_log\\s+([^;]+);").matcher(conf);
    while (every.find()) {
      String directive = every.group(1).trim();
      assertTrue(directive.equals("off") || directive.endsWith(" " + name), "access_log sans le format sûr : " + directive);
    }
  }

  @Test
  void noEntityStoresAPatientPosition() throws ClassNotFoundException, IOException {
    try (Stream<Path> files = Files.list(Path.of("src/main/java/fr/medislot/domain"))) {
      for (Path f : files.toList()) {
        String cls = "fr.medislot.domain." + f.getFileName().toString().replace(".java", "");
        for (Field field : Class.forName(cls).getDeclaredFields()) {
          String n = field.getName().toLowerCase();
          boolean position = n.startsWith("lat") || n.startsWith("lon") || n.contains("position") || n.contains("location");
          // Seul le cabinet (adresse professionnelle, publique) a une position.
          assertTrue(!position || cls.endsWith(".Professional"), cls + "." + field.getName());
        }
      }
    }
  }
}
