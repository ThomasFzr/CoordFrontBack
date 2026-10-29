package fr.medislot;
import fr.medislot.application.BookingService;
import fr.medislot.domain.*;
import fr.medislot.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class BookingServiceTest {
 @Test void pastSlotIsRejectedBeforeSaving(){
  var users=mock(UserRepository.class);var slots=mock(SlotRepository.class);var appointments=mock(AppointmentRepository.class);
  var user=new AppUser();user.id=1L;var slot=new Slot();slot.id=1L;slot.startsAt=Instant.now().minusSeconds(60);
  when(users.findByEmail("patient@test")).thenReturn(Optional.of(user));when(slots.lockById(1L)).thenReturn(Optional.of(slot));
  var service=new BookingService(users,slots,appointments,mock(AuditRepository.class),mock(NotificationRepository.class),mock(ApplicationEventPublisher.class));
  assertEquals(409,assertThrows(ResponseStatusException.class,()->service.book("patient@test",1L)).getStatusCode().value());
  verify(appointments,never()).saveAndFlush(any());
 }
}
