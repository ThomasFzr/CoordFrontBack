package fr.medislot.document;

import java.nio.charset.StandardCharsets;
import org.thymeleaf.spring6.SpringTemplateEngine;
import org.thymeleaf.templatemode.TemplateMode;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;

/** Le vrai modèle et le vrai moteur, sans Spring ni base : même résolution que Spring Boot (classpath:/templates/). */
final class TestPdf {
  private TestPdf() {}

  static PdfRenderer renderer() {
    var resolver = new ClassLoaderTemplateResolver();
    resolver.setPrefix("templates/");
    resolver.setSuffix(".html");
    resolver.setTemplateMode(TemplateMode.HTML);
    resolver.setCharacterEncoding(StandardCharsets.UTF_8.name());
    var engine = new SpringTemplateEngine();   // SpEL, comme dans Spring Boot (pas OGNL)
    engine.setTemplateResolver(resolver);
    return new PdfRenderer(engine);
  }
}
