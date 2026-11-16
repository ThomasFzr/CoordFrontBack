package fr.medislot.repository;
import fr.medislot.domain.Slot;
import org.springframework.data.jpa.repository.*;
public interface SlotRepository extends JpaRepository<Slot,Long> { @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
 @Query("select s from Slot s where s.id=:id") java.util.Optional<Slot> lockById(Long id);
 @Query("select s from Slot s where s.professionalId=:professionalId and s.startsAt>=:from and s.startsAt<:until and not exists (select a.id from Appointment a where a.slotId=s.id and a.status='CONFIRMED') order by s.startsAt")
 java.util.List<Slot> available(Long professionalId, java.time.Instant from, java.time.Instant until); }
