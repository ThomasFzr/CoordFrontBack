package fr.medislot.document;

import com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder.FontStyle;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import com.openhtmltopdf.util.XRLog;
import java.io.ByteArrayOutputStream;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.thymeleaf.ITemplateEngine;
import org.thymeleaf.context.Context;

/**
 * Modèle Thymeleaf → HTML → PDF (Open HTML to PDF), dans le processus Spring : aucun service de plus.
 * Les polices viennent du classpath : l'image eclipse-temurin:25-jre n'en fournit aucune sur laquelle compter.
 */
@Component
public class PdfRenderer {
  static final String FAMILY = "DejaVu Sans";
  static final String FAILED = "La convocation n’a pas pu être générée. Réessayez dans un instant.";
  private static final Logger log = LoggerFactory.getLogger(PdfRenderer.class);

  static {
    // Le moteur écrit 5 lignes INFO par PDF : on ne garde que ses avertissements et erreurs.
    XRLog.listRegisteredLoggers().forEach(name -> XRLog.setLevel(name, java.util.logging.Level.WARNING));
  }

  private final ITemplateEngine templates;

  public PdfRenderer(ITemplateEngine templates) { this.templates = templates; }

  public byte[] render(String template, Map<String, Object> data) {
    String html = templates.process(template, new Context(Locale.FRENCH, data));   // 1. HTML échappé
    try (var out = new ByteArrayOutputStream()) {
      var pdf = new PdfRendererBuilder();
      pdf.useFastMode();
      font(pdf, "/fonts/DejaVuSans.ttf", 400);                                      // 2. polices embarquées
      font(pdf, "/fonts/DejaVuSans-Bold.ttf", 700);
      pdf.usePdfUaAccessibility(true);                                             // 3. PDF balisé
      pdf.withHtmlContent(html, "/");
      pdf.toStream(out);
      pdf.run();                                                                   // 4. octets du PDF
      return out.toByteArray();
    } catch (Exception e) {
      // Pas de donnée de santé dans le journal : seulement le modèle et la cause technique.
      log.error("Échec du rendu PDF du modèle {}", template, e);
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, FAILED, e);
    }
  }

  private static void font(PdfRendererBuilder pdf, String path, int weight) {
    if (PdfRenderer.class.getResource(path) == null) {
      throw new IllegalStateException("Police absente du classpath : " + path);
    }
    // subset = true : seules les lettres utilisées sont copiées dans le PDF.
    pdf.useFont(() -> PdfRenderer.class.getResourceAsStream(path), FAMILY, weight, FontStyle.NORMAL, true);
  }
}
