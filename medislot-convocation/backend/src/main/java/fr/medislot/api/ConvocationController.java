package fr.medislot.api;

import fr.medislot.document.ConvocationService;
import java.security.Principal;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Contrat (docs/openapi.yaml) : 200 application/pdf, inline par défaut, attachment avec ?download=true,
 * nom neutre, aucune copie en cache. Erreurs 401, 404, 409, 500 en ProblemDetail (Errors).
 * Le contrôleur ne fabrique rien : il demande le PDF au service et pose les en-têtes.
 */
@RestController
public class ConvocationController {
  private final ConvocationService service;

  public ConvocationController(ConvocationService service) { this.service = service; }

  @GetMapping(value = "/api/appointments/{id}/convocation.pdf",
      produces = {MediaType.APPLICATION_PDF_VALUE, MediaType.APPLICATION_PROBLEM_JSON_VALUE})
  public ResponseEntity<byte[]> convocation(Principal p, @PathVariable Long id,
                                            @RequestParam(defaultValue = "false") boolean download) {
    var c = service.build(p.getName(), id);
    var how = download ? ContentDisposition.attachment() : ContentDisposition.inline();
    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_PDF)
        .header(HttpHeaders.CONTENT_DISPOSITION, how.filename(c.filename()).build().toString())
        .cacheControl(CacheControl.noStore())
        .contentLength(c.pdf().length)
        .body(c.pdf());
  }
}
