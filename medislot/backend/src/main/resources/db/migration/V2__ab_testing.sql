-- Test A/B du bouton de réservation. Une affectation par (expérience, navigateur) ; l'identifiant est
-- l'UUID opaque du cookie ab_visitor, jamais une donnée patient.
CREATE TABLE ab_assignment (
  experiment VARCHAR(60) NOT NULL,
  subject_id UUID NOT NULL,
  variant CHAR(1) NOT NULL CHECK (variant IN ('A','B')),
  bucket SMALLINT NOT NULL CHECK (bucket BETWEEN 0 AND 255),
  assigned_at TIMESTAMPTZ NOT NULL,
  exposed_at TIMESTAMPTZ,
  PRIMARY KEY (experiment, subject_id)
);
-- Une ligne par réservation attribuée (jamais deux pour le même rendez-vous). Aucune spécialité,
-- aucun praticien, aucun motif : seul le lien statistique sujet ↔ rendez-vous est conservé.
CREATE TABLE ab_conversion (
  appointment_id BIGINT PRIMARY KEY REFERENCES appointment(id),
  experiment VARCHAR(60) NOT NULL,
  subject_id UUID NOT NULL,
  variant CHAR(1) NOT NULL,
  converted_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (experiment, subject_id) REFERENCES ab_assignment(experiment, subject_id)
);
CREATE INDEX ab_conversion_subject_idx ON ab_conversion(experiment, subject_id);
