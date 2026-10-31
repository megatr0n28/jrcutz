CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer'
        CHECK (role IN ('customer', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE services (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    duration_minutes INTEGER NOT NULL
        CHECK (duration_minutes > 0),
    active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE barbers (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    specialty TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE barber_hours (
    id BIGSERIAL PRIMARY KEY,
    barber_id BIGINT NOT NULL REFERENCES barbers(id),
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    opens_at TIME NOT NULL,
    closes_at TIME NOT NULL,
    CHECK (opens_at < closes_at),
    UNIQUE (barber_id, weekday)
);

CREATE TABLE appointments (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES users(id),
    barber_id BIGINT NOT NULL REFERENCES barbers(id),
    service_id BIGINT NOT NULL REFERENCES services(id),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending', 'confirmed', 'completed', 'cancelled'
        )),
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);

-- Prevent overlapping active appointments, including concurrent
-- requests made by different customers.
ALTER TABLE appointments
ADD CONSTRAINT no_barber_time_overlap
EXCLUDE USING gist (
    barber_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
)
WHERE (status <> 'cancelled');

CREATE INDEX appointments_customer_idx
    ON appointments(customer_id, starts_at DESC);

CREATE INDEX appointments_schedule_idx
    ON appointments(barber_id, starts_at);

INSERT INTO services (name, description, price_cents, duration_minutes)
VALUES
('Precision Haircut', 'Classic cuts and modern fades', 3500, 30),
('Haircut & Beard', 'A tailored haircut and beard finish', 5000, 45),
('Beard Trim', 'Beard shaping and detailing', 2000, 20),
('Hot Towel Shave', 'Traditional close shave', 3000, 30);

INSERT INTO barbers (name, bio, specialty)
VALUES
('Barber One', 'Experienced barber focused on detail.',
 'Fades and precision cuts'),
('Barber Two', 'Classic grooming with a modern finish.',
 'Classic cuts and beard grooming');

INSERT INTO barber_hours (barber_id, weekday, opens_at, closes_at)
SELECT b.id, d.weekday, '09:00'::time, '18:00'::time
FROM barbers b
CROSS JOIN generate_series(1, 6) AS d(weekday);
