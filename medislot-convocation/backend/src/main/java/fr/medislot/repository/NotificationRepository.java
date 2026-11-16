package fr.medislot.repository;
import fr.medislot.domain.Notification;
import org.springframework.data.jpa.repository.*;
public interface NotificationRepository extends JpaRepository<Notification,Long> { java.util.List<Notification> findTop30ByPatientIdOrderByCreatedAtDesc(Long patientId); }
