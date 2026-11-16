package fr.medislot.document;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;

/** Formats imprimés sur la convocation. La base garde l'instant en UTC, le papier montre l'heure du cabinet. */
public final class ConvocationFormats {
  public static final ZoneId PARIS = ZoneId.of("Europe/Paris");

  private static final DateTimeFormatter DAY = DateTimeFormatter
      .ofPattern("EEEE d MMMM yyyy", Locale.FRENCH).withZone(PARIS);
  private static final DateTimeFormatter TIME = DateTimeFormatter
      .ofPattern("H 'h' mm", Locale.FRENCH).withZone(PARIS);
  private static final DateTimeFormatter ISSUED = DateTimeFormatter
      .ofPattern("d MMMM yyyy", Locale.FRENCH).withZone(PARIS);

  /** Mêmes libellés que le front (frontend/src/types.ts). */
  private static final Map<String, String> SPECIALTIES = Map.of(
      "general", "Médecine générale",
      "cardiology", "Cardiologie",
      "dermatology", "Dermatologie",
      "dentistry", "Chirurgie dentaire");

  private ConvocationFormats() {}

  public static String day(Instant at) { return DAY.format(at); }
  public static String time(Instant at) { return TIME.format(at); }
  public static String issuedOn(Instant at) { return ISSUED.format(at); }
  public static String specialty(String code) { return SPECIALTIES.getOrDefault(code, code); }
  public static String reference(Long appointmentId) { return "RDV-" + appointmentId; }
}
