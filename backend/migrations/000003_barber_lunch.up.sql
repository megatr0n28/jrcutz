ALTER TABLE barber_availability
    ADD COLUMN IF NOT EXISTS lunch_start TIME,
    ADD COLUMN IF NOT EXISTS lunch_end TIME;

ALTER TABLE barber_availability
    ADD CONSTRAINT valid_lunch_break CHECK (
        (lunch_start IS NULL AND lunch_end IS NULL)
        OR (
            lunch_start IS NOT NULL AND lunch_end IS NOT NULL
            AND lunch_start < lunch_end
            AND lunch_start >= start_time
            AND lunch_end <= end_time
        )
    );
