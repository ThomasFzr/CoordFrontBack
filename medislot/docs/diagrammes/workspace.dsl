workspace "MediSlot" "Architecture pédagogique" {
 model {
  patient = person "Patient"
  app = softwareSystem "MediSlot" {
   web = container "Vue" "Interface patient" "Vue 3"
   api = container "API" "Réservation et droits" "Spring Boot"
   db = container "Base" "Données persistantes" "PostgreSQL"
  }
  patient -> web "Recherche et réserve"
  web -> api "HTTP et SSE"
  api -> db "SQL"
 }
 views { container app { include * autolayout lr } }
}
