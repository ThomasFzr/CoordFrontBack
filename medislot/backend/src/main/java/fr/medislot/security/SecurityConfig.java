package fr.medislot.security;
import fr.medislot.repository.UserRepository;
import jakarta.servlet.DispatcherType;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
@Configuration
public class SecurityConfig {
 @Bean PasswordEncoder encoder(){return new BCryptPasswordEncoder();}
 @Bean UserDetailsService users(UserRepository users){return email -> users.findByEmail(email.toLowerCase(java.util.Locale.ROOT)).map(u->User.withUsername(u.email).password(u.password).roles(u.role).build()).orElseThrow(()->new UsernameNotFoundException("Identité inconnue"));}
 @Bean SecurityFilterChain filter(HttpSecurity http) throws Exception {
  http.authorizeHttpRequests(a->a.dispatcherTypeMatchers(DispatcherType.ASYNC,DispatcherType.ERROR).permitAll()
    .requestMatchers("/api/csrf","/api/register","/api/login","/api/professionals/**","/api/events","/actuator/health").permitAll()
    .requestMatchers("/api/**").authenticated().anyRequest().permitAll())
   .requestCache(c->c.disable())
   .formLogin(f->f.loginProcessingUrl("/api/login")
    .successHandler((req,res,auth)->res.setStatus(204))
    .failureHandler((req,res,ex)->{res.setStatus(401);res.setContentType("application/problem+json");res.getWriter().write("{\"title\":\"Identifiants incorrects\",\"status\":401}");}))
   .logout(l->l.logoutUrl("/api/logout").logoutSuccessHandler((req,res,auth)->res.setStatus(204)))
   .exceptionHandling(e->e.authenticationEntryPoint((req,res,ex)->{res.setStatus(401);res.setContentType("application/problem+json");res.getWriter().write("{\"title\":\"Connexion requise\",\"status\":401}");})
    .accessDeniedHandler((req,res,ex)->{res.setStatus(403);res.setContentType("application/problem+json");res.getWriter().write("{\"title\":\"Action refusée ou jeton CSRF expiré\",\"status\":403}");}));
  return http.build();
 }
}
