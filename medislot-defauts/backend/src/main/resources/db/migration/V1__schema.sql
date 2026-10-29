CREATE TABLE app_user (id BIGSERIAL PRIMARY KEY, email VARCHAR(254) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, name VARCHAR(120) NOT NULL, role VARCHAR(30) NOT NULL);
CREATE TABLE professional (id BIGSERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL, specialty VARCHAR(60) NOT NULL, city VARCHAR(80) NOT NULL, address VARCHAR(200) NOT NULL, bio VARCHAR(1000) NOT NULL, fee INTEGER NOT NULL CHECK(fee >= 0));
CREATE TABLE slot (id BIGSERIAL PRIMARY KEY, professional_id BIGINT NOT NULL REFERENCES professional(id), starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL, CHECK(ends_at > starts_at), UNIQUE(professional_id, starts_at));
CREATE TABLE appointment (id BIGSERIAL PRIMARY KEY, patient_id BIGINT NOT NULL REFERENCES app_user(id), slot_id BIGINT NOT NULL REFERENCES slot(id), status VARCHAR(20) NOT NULL CHECK(status IN ('CONFIRMED','CANCELLED')), created_at TIMESTAMPTZ NOT NULL);
CREATE UNIQUE INDEX one_active_appointment_per_slot ON appointment(slot_id) WHERE status='CONFIRMED';
CREATE INDEX appointment_patient_idx ON appointment(patient_id, created_at DESC);
CREATE INDEX slot_search_idx ON slot(professional_id, starts_at);
CREATE TABLE audit_event (id BIGSERIAL PRIMARY KEY, appointment_id BIGINT NOT NULL REFERENCES appointment(id), actor_id BIGINT NOT NULL REFERENCES app_user(id), action VARCHAR(40) NOT NULL, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE notification (id BIGSERIAL PRIMARY KEY, patient_id BIGINT NOT NULL REFERENCES app_user(id), message VARCHAR(240) NOT NULL, created_at TIMESTAMPTZ NOT NULL);
