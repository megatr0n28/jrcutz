CREATE TABLE addons (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    active BOOLEAN NOT NULL DEFAULT true
);

-- Which services an add-on may be attached to.
CREATE TABLE addon_services (
    addon_id BIGINT NOT NULL REFERENCES addons(id) ON DELETE CASCADE,
    service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    PRIMARY KEY (addon_id, service_id)
);

-- Price and duration are copied so later catalog edits don't change history.
CREATE TABLE appointment_addons (
    appointment_id BIGINT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    addon_id BIGINT NOT NULL REFERENCES addons(id),
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    PRIMARY KEY (appointment_id, addon_id)
);

INSERT INTO addons (name, description, price_cents, duration_minutes)
VALUES ('Enhancements', 'Add-on finishing touches for your service.', 500, 5);

INSERT INTO addon_services (addon_id, service_id)
SELECT a.id, s.id
FROM addons a
JOIN services s ON s.name IN ('Precision Haircut', 'Haircut & Beard')
WHERE a.name = 'Enhancements';
