package fr.medislot.repository;
import fr.medislot.domain.AuditEvent;
import org.springframework.data.jpa.repository.*;
public interface AuditRepository extends JpaRepository<AuditEvent,Long> { java.util.List<AuditEvent> findByAppointmentIdOrderByCreatedAtAsc(Long appointmentId); }
