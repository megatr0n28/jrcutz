CREATE TABLE IF NOT EXISTS barber_availability (
    id BIGSERIAL PRIMARY KEY,
    barber_id BIGINT NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_availability_time CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_barber_availability_lookup
ON barber_availability(barber_id, day_of_week, is_active);
