package fr.medislot.api;
import fr.medislot.domain.AppUser;
import fr.medislot.repository.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
@RestController @RequestMapping("/api")
public class AuthController {
 private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(AuthController.class);
 private final UserRepository users; private final PasswordEncoder encoder;
 public AuthController(UserRepository users,PasswordEncoder encoder){this.users=users;this.encoder=encoder;}
 public record Identity(Long id,String name,String email,String role){}
 public record Registration(@Email @NotBlank @Size(max=254) String email,@NotBlank @Size(min=12,max=72) String password,@NotBlank @Size(max=120) String name){}
 @GetMapping("/csrf") public java.util.Map<String,String> csrf(CsrfToken token){return java.util.Map.of("token",token.getToken(),"headerName",token.getHeaderName());}
 @GetMapping("/me") public Identity me(java.security.Principal principal){AppUser u=users.findByEmail(principal.getName()).orElseThrow();return new Identity(u.id,u.name,u.email,u.role);}
 @PostMapping("/register") @ResponseStatus(HttpStatus.CREATED)
 public Identity register(@Valid @RequestBody Registration input){
  if(input.password().getBytes(java.nio.charset.StandardCharsets.UTF_8).length>72)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Le mot de passe doit contenir au maximum 72 octets UTF-8.");
  String email=input.email().strip().toLowerCase(java.util.Locale.ROOT);
  if(users.existsByEmail(email))throw new ResponseStatusException(HttpStatus.CONFLICT,"Cette adresse est déjà utilisée.");
  AppUser u=new AppUser();u.email=email;u.name=input.name().strip();u.password=encoder.encode(input.password());u.role="PATIENT";users.saveAndFlush(u);
  log.info("Nouvel inscrit : "+u.name+" <"+u.email+"> mot de passe de "+input.password().length()+" caracteres");
  return new Identity(u.id,u.name,u.email,u.role);
 }
}
