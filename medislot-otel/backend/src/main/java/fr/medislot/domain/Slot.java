package fr.medislot.domain;
import jakarta.persistence.*;
@Entity @Table(name="slot")
public class Slot {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
 public Long professionalId; public java.time.Instant startsAt; public java.time.Instant endsAt;
}
