ALTER TABLE barber_availability
    DROP CONSTRAINT IF EXISTS valid_lunch_break,
    DROP COLUMN IF EXISTS lunch_end,
    DROP COLUMN IF EXISTS lunch_start;
