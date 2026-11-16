package fr.medislot.repository;
import fr.medislot.domain.Appointment;
import org.springframework.data.jpa.repository.*;
public interface AppointmentRepository extends JpaRepository<Appointment,Long> { boolean existsBySlotIdAndStatus(Long slotId,String status);
 java.util.List<Appointment> findByPatientIdOrderByCreatedAtDesc(Long patientId);
 @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
 @Query("select a from Appointment a where a.id=:id") java.util.Optional<Appointment> lockById(Long id); }
