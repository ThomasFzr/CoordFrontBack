package fr.medislot.domain;
import jakarta.persistence.*;
@Entity @Table(name="app_user")
public class AppUser {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
 public String email; public String password; public String name; public String role;
}
