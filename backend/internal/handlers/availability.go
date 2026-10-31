// The following uses pgxpool and Go's standard HTTP request handling.
// It assumes your existing application has a PostgreSQL pool called db and an admin-only router group.
// This handler provides endpoints to get and save barber availability blocks.
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AvailabilityHandler struct {
	DB *pgxpool.Pool
}

type AvailabilityBlock struct {
	ID        int64  `json:"id"`
	BarberID  int64  `json:"barberId"`
	DayOfWeek int    `json:"dayOfWeek"`
	StartTime string `json:"startTime"`
	EndTime   string `json:"endTime"`
	IsActive  bool   `json:"isActive"`
}

func (h *AvailabilityHandler) Get(w http.ResponseWriter, r *http.Request) {
	barberID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || barberID <= 0 {
		http.Error(w, "Invalid barber ID", http.StatusBadRequest)
		return
	}

	rows, err := h.DB.Query(r.Context(), `
        SELECT id, barber_id, day_of_week,
               to_char(start_time, 'HH24:MI'),
               to_char(end_time, 'HH24:MI'),
               is_active
        FROM barber_availability
        WHERE barber_id = $1
        ORDER BY day_of_week, start_time
    `, barberID)

	if err != nil {
		http.Error(w, "Unable to retrieve schedule",
			http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	blocks := []AvailabilityBlock{}

	for rows.Next() {
		var b AvailabilityBlock

		err := rows.Scan(
			&b.ID,
			&b.BarberID,
			&b.DayOfWeek,
			&b.StartTime,
			&b.EndTime,
			&b.IsActive,
		)

		if err != nil {
			http.Error(w, "Unable to read schedule",
				http.StatusInternalServerError)
			return
		}

		blocks = append(blocks, b)
	}

	if rows.Err() != nil {
		http.Error(w, "Unable to read schedule",
			http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(blocks)
}

func (h *AvailabilityHandler) Save(w http.ResponseWriter, r *http.Request) {
	barberID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || barberID <= 0 {
		http.Error(w, "Invalid barber ID", http.StatusBadRequest)
		return
	}

	var blocks []AvailabilityBlock

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&blocks); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(blocks) > 100 {
		http.Error(w, "Too many availability blocks",
			http.StatusBadRequest)
		return
	}

	// Validate all blocks before modifying the database.
	for _, b := range blocks {
		if b.DayOfWeek < 0 || b.DayOfWeek > 6 {
			http.Error(w, "Invalid day of week",
				http.StatusBadRequest)
			return
		}

		start, e1 := time.Parse("15:04", b.StartTime)
		end, e2 := time.Parse("15:04", b.EndTime)

		if e1 != nil || e2 != nil || !start.Before(end) {
			http.Error(w, "Invalid availability time",
				http.StatusBadRequest)
			return
		}
	}

	// Reject overlapping active blocks for the same day.
	for i, a := range blocks {
		if !a.IsActive {
			continue
		}

		for _, b := range blocks[i+1:] {
			if !b.IsActive || a.DayOfWeek != b.DayOfWeek {
				continue
			}

			if a.StartTime < b.EndTime &&
				b.StartTime < a.EndTime {
				http.Error(w, "Availability blocks cannot overlap",
					http.StatusConflict)
				return
			}
		}
	}

	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "Database error",
			http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	// Confirm that the barber exists.
	var exists bool
	err = tx.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM barbers WHERE id = $1)`,
		barberID,
	).Scan(&exists)

	if err != nil || !exists {
		http.Error(w, "Barber not found", http.StatusNotFound)
		return
	}

	// Preserve existing availability if an appointment is
	// already scheduled in one of the blocks being removed.
	err = tx.QueryRow(r.Context(), `
        SELECT EXISTS (
            SELECT 1
            FROM appointments a
            WHERE a.barber_id = $1
              AND a.status IN ('pending', 'confirmed')
              AND NOT EXISTS (
                  SELECT 1
                  FROM jsonb_to_recordset($2::jsonb)
                    AS b("dayOfWeek" int, "startTime" text,
                         "endTime" text, "isActive" boolean)
                  WHERE b."dayOfWeek" =
                    EXTRACT(DOW FROM a.starts_at)::int
                    AND b."isActive"
                    AND a.starts_at::time >= b."startTime"::time
                    AND a.ends_at::time <= b."endTime"::time
              )
        )
    `, barberID, blocksJSON(blocks)).Scan(&exists)

	if err != nil {
		http.Error(w, "Unable to validate existing appointments",
			http.StatusInternalServerError)
		return
	}

	if exists {
		http.Error(w,
			"Cannot remove availability containing existing appointments",
			http.StatusConflict)
		return
	}

	_, err = tx.Exec(r.Context(),
		`DELETE FROM barber_availability WHERE barber_id = $1`,
		barberID,
	)
	if err != nil {
		http.Error(w, "Unable to update schedule",
			http.StatusInternalServerError)
		return
	}

	for _, b := range blocks {
		_, err = tx.Exec(r.Context(), `
            INSERT INTO barber_availability
                (barber_id, day_of_week, start_time, end_time, is_active)
            VALUES ($1, $2, $3::time, $4::time, $5)
        `,
			barberID,
			b.DayOfWeek,
			b.StartTime,
			b.EndTime,
			b.IsActive,
		)

		if err != nil {
			http.Error(w, "Unable to save availability",
				http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "Unable to save schedule",
			http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Availability saved successfully",
	})
}

func blocksJSON(blocks []AvailabilityBlock) []byte {
	data, err := json.Marshal(blocks)
	if err != nil {
		panic(fmt.Sprintf("availability serialization failed: %v", err))
	}
	return data
}
