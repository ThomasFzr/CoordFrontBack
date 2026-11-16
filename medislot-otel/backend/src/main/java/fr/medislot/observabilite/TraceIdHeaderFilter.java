package fr.medislot.observabilite;

import io.opentelemetry.api.trace.Span;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Renvoie l'identifiant de la trace courante dans l'en-tête X-Trace-Id (cours, chapitre 6).
 * Le front l'ajoute à ses messages d'erreur : le support le recopie dans le ticket, l'équipe l'ouvre dans Jaeger.
 * Sans agent OpenTelemetry, le contexte est invalide et aucun en-tête n'est ajouté.
 * Premier filtre de la chaîne, et posé avant l'exécution : l'en-tête figure aussi sur les réponses d'erreur.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdHeaderFilter extends OncePerRequestFilter {

    public static final String EN_TETE = "X-Trace-Id";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var contexte = Span.current().getSpanContext();
        if (contexte.isValid()) {
            response.setHeader(EN_TETE, contexte.getTraceId());
        }
        chain.doFilter(request, response);
    }
}
