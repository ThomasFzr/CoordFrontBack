package fr.medislot.ab;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
@RestController @RequestMapping("/api/ab")
public class AbController {
 public static final String COOKIE="ab_visitor";
 private final AbService ab; private final boolean secureCookie;
 public AbController(AbService ab,@Value("${server.servlet.session.cookie.secure:false}") boolean secureCookie){this.ab=ab;this.secureCookie=secureCookie;}
 /** Jamais de valeur libre : seul un UUID bien formé est accepté comme identité. */
 public static UUID uuid(String value){if(value==null)return null;try{return UUID.fromString(value);}catch(IllegalArgumentException e){return null;}}

 @GetMapping("/assignment") public ResponseEntity<Map<String,Object>> assignment(@CookieValue(name=COOKIE,required=false) String cookie){
  var res=ResponseEntity.ok().cacheControl(CacheControl.noStore()); // ni CDN ni navigateur : chaque navigateur a sa variante
  if(!ab.enabled())return res.body(Map.<String,Object>of("experiment",AbService.EXP,"enabled",false,"variant","A"));
  UUID known=uuid(cookie),id=known!=null?known:UUID.randomUUID();
  if(known==null)res.header(HttpHeaders.SET_COOKIE,ResponseCookie.from(COOKIE,id.toString()) // posé une fois, jamais prolongé (< 13 mois)
   .httpOnly(true).secure(secureCookie).sameSite("Lax").path("/").maxAge(Duration.ofDays(390)).build().toString());
  var a=ab.assign(id);
  return res.body(Map.<String,Object>of("experiment",a.experiment(),"enabled",true,"variant",a.variant(),"bucket",a.bucket()));
 }

 /** Le client ne dit pas sa variante : le serveur la retrouve par le cookie. Répéter l'appel ne compte pas deux fois. */
 @PostMapping("/exposure") public ResponseEntity<Void> exposure(@CookieValue(name=COOKIE,required=false) String cookie){
  if(!ab.enabled())return ResponseEntity.noContent().build(); // expérience arrêtée : rien n'est enregistré
  UUID id=uuid(cookie);
  if(id==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Identifiant d’expérience absent.");
  if(ab.expose(id)==AbService.Exposure.UNKNOWN)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Aucune affectation pour ce navigateur.");
  return ResponseEntity.noContent().build();
 }

 @GetMapping("/metrics") public ResponseEntity<AbService.Metrics> metrics(){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ab.metrics());}
}
