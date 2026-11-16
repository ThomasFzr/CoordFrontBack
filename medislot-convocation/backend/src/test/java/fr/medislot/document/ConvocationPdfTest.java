package fr.medislot.document;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * On relit ce qui est imprimé, comme on lit le JSON d'une API : texte extrait, pages, polices, balisage.
 * Jamais de comparaison octet par octet (date de création et identifiants changent à chaque rendu).
 */
class ConvocationPdfTest {
  static final ConvocationView VIEW = new ConvocationView(
      "RDV-42", "Hélène Durand", "Dr Thomas Leroy", "Cardiologie",
      "42 rue de Rennes", "Paris", "mardi 24 novembre 2026", "9 h 30", "16 novembre 2026");

  static byte[] pdf;

  @BeforeAll
  static void render() throws Exception {
    pdf = TestPdf.renderer().render("convocation", Map.of("c", VIEW));
    // Épreuve à relire comme un patient (TP étape 3, point 4).
    Files.createDirectories(Path.of("target"));
    Files.write(Path.of("target/convocation-exemple.pdf"), pdf);
  }

  @Test
  void imprimeLeJourLHeureLePraticienEtLAdresse() throws Exception {
    try (PDDocument doc = Loader.loadPDF(pdf)) {
      String t = new PDFTextStripper().getText(doc);
      assertTrue(t.contains("mardi 24 novembre 2026"), t);
      assertTrue(t.contains("9 h 30"), t);
      assertTrue(t.contains("heure de Paris"), t);
      assertTrue(t.contains("Dr Thomas Leroy"), t);
      assertTrue(t.contains("Cardiologie"), t);
      assertTrue(t.contains("42 rue de Rennes, Paris"), t);
      assertTrue(t.contains("RDV-42"), t);
    }
  }

  @Test
  void garderLesAccentsDuNom() throws Exception {
    try (PDDocument doc = Loader.loadPDF(pdf)) {
      String t = new PDFTextStripper().getText(doc);
      assertTrue(t.contains("Hélène Durand"), t);
      assertTrue(t.contains("Spécialité"), t);
      assertFalse(t.contains("H?l?ne"), t);
    }
  }

  @Test
  void tientSurUnePageA4() throws Exception {
    try (PDDocument doc = Loader.loadPDF(pdf)) {
      assertEquals(1, doc.getNumberOfPages());
      var box = doc.getPage(0).getMediaBox();
      assertEquals(595, Math.round(box.getWidth()));   // 210 mm
      assertEquals(842, Math.round(box.getHeight()));  // 297 mm
      String t = new PDFTextStripper().getText(doc);
      assertTrue(t.contains("page 1 sur 1"), t);
    }
  }

  @Test
  void embarqueToutesSesPolices() throws Exception {
    try (PDDocument doc = Loader.loadPDF(pdf)) {
      var resources = doc.getPage(0).getResources();
      int fonts = 0;
      for (var name : resources.getFontNames()) {
        PDFont f = resources.getFont(name);
        assertTrue(f.isEmbedded(), "police non embarquée : " + f.getName());
        assertTrue(f.getName().contains("DejaVuSans"), f.getName());
        fonts++;
      }
      assertTrue(fonts >= 1);
    }
  }

  @Test
  void estBaliseAvecLangueEtTitre() throws Exception {
    try (PDDocument doc = Loader.loadPDF(pdf)) {
      var catalog = doc.getDocumentCatalog();
      assertNotNull(catalog.getStructureTreeRoot(), "PDF non balisé");
      assertNotNull(catalog.getMarkInfo());
      assertTrue(catalog.getMarkInfo().isMarked());
      assertEquals("fr", catalog.getLanguage());
      assertEquals("Convocation RDV-42", doc.getDocumentInformation().getTitle());
    }
  }

  @Test
  void echappeLesDonnees() throws Exception {
    var hostile = new ConvocationView("RDV-7", "<b>Léa</b> & Cie", "Dr X", "Dermatologie",
        "1 rue A", "Lyon", "lundi 1 mars 2027", "8 h 00", "16 novembre 2026");
    byte[] bytes = TestPdf.renderer().render("convocation", Map.of("c", hostile));
    try (PDDocument doc = Loader.loadPDF(bytes)) {
      String t = new PDFTextStripper().getText(doc);
      assertTrue(t.contains("<b>Léa</b> & Cie"), t);  // th:text : le balisage reste du texte
    }
  }
}
