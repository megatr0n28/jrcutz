package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strconv"
	"time"
	_ "time/tzdata"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const slotStepMinutes = 15

type SlotsHandler struct {
	DB *pgxpool.Pool
}

type Slot struct {
	StartsAt  string `json:"startsAt"`
	Time      string `json:"time"`
	Available bool   `json:"available"`
	// Reason is "booked" or "past" when the slot is unavailable.
	Reason string `json:"reason,omitempty"`
}

type SlotsResponse struct {
	Date            string `json:"date"`
	Timezone        string `json:"timezone"`
	DurationMinutes int    `json:"durationMinutes"`
	Slots           []Slot `json:"slots"`
}

func ShopLocation() *time.Location {
	name := os.Getenv("SHOP_TIMEZONE")
	if name == "" {
		name = "America/New_York"
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.UTC
	}
	return loc
}

func writeSlotsError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// Get lists 15-minute start times for one barber on one date, built from the
// barber's active weekly hours. A start time is available when the whole
// service fits inside a working block, is in the future, and does not overlap
// an existing non-cancelled appointment.
func (h *SlotsHandler) Get(w http.ResponseWriter, r *http.Request) {
	barberID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || barberID <= 0 {
		writeSlotsError(w, http.StatusBadRequest, "Invalid barber ID")
		return
	}
	// Without a service, show plain 15-minute slots (used by the admin view).
	var serviceID int64
	if raw := r.URL.Query().Get("serviceId"); raw != "" {
		serviceID, err = strconv.ParseInt(raw, 10, 64)
		if err != nil || serviceID <= 0 {
			writeSlotsError(w, http.StatusBadRequest, "Invalid service")
			return
		}
	}

	loc := ShopLocation()
	day, err := time.ParseInLocation("2006-01-02", r.URL.Query().Get("date"), loc)
	if err != nil {
		writeSlotsError(w, http.StatusBadRequest, "Invalid date")
		return
	}

	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	if day.Before(today) || day.After(now.AddDate(0, 3, 0)) {
		writeSlotsError(w, http.StatusBadRequest,
			"Choose a date within the next 3 months")
		return
	}

	ctx := r.Context()

	duration := slotStepMinutes
	if serviceID > 0 {
		err = h.DB.QueryRow(ctx,
			`SELECT duration_minutes FROM services WHERE id = $1 AND active`,
			serviceID).Scan(&duration)
		if err != nil {
			writeSlotsError(w, http.StatusBadRequest, "Service unavailable")
			return
		}

		addOnIDs, perr := ParseAddOnIDs(r.URL.Query().Get("addOnIds"))
		var addOns []AddOn
		if perr == nil {
			addOns, perr = ResolveAddOns(ctx, h.DB, serviceID, addOnIDs)
		}
		if perr != nil {
			if errors.Is(perr, ErrAddOnUnavailable) {
				writeSlotsError(w, http.StatusBadRequest, perr.Error())
			} else {
				writeSlotsError(w, http.StatusInternalServerError,
					"Unable to load add-ons")
			}
			return
		}
		duration += AddOnMinutes(addOns)
	} else if r.URL.Query().Get("addOnIds") != "" {
		writeSlotsError(w, http.StatusBadRequest,
			"Add-ons require a service")
		return
	}

	var barberOK bool
	err = h.DB.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM barbers WHERE id = $1 AND active)`,
		barberID).Scan(&barberOK)
	if err != nil || !barberOK {
		writeSlotsError(w, http.StatusBadRequest, "Barber unavailable")
		return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT to_char(start_time, 'HH24:MI'), to_char(end_time, 'HH24:MI'),
		       to_char(lunch_start, 'HH24:MI'), to_char(lunch_end, 'HH24:MI')
		FROM barber_availability
		WHERE barber_id = $1 AND day_of_week = $2 AND is_active
		ORDER BY start_time`, barberID, int(day.Weekday()))
	if err != nil {
		writeSlotsError(w, http.StatusInternalServerError,
			"Unable to load schedule")
		return
	}
	at := func(hm string) time.Time {
		t, _ := time.Parse("15:04", hm)
		return time.Date(day.Year(), day.Month(), day.Day(),
			t.Hour(), t.Minute(), 0, 0, loc)
	}
	type block struct {
		start, end           time.Time
		lunchStart, lunchEnd time.Time
		hasLunch             bool
	}
	var blocks []block
	for rows.Next() {
		var s, e string
		var ls, le *string
		if rows.Scan(&s, &e, &ls, &le) != nil {
			rows.Close()
			writeSlotsError(w, http.StatusInternalServerError,
				"Unable to read schedule")
			return
		}
		if _, err := time.Parse("15:04", s); err != nil {
			continue
		}
		if _, err := time.Parse("15:04", e); err != nil {
			continue
		}
		b := block{start: at(s), end: at(e)}
		if ls != nil && le != nil {
			b.lunchStart, b.lunchEnd, b.hasLunch = at(*ls), at(*le), true
		}
		blocks = append(blocks, b)
	}
	rows.Close()
	if rows.Err() != nil {
		writeSlotsError(w, http.StatusInternalServerError,
			"Unable to read schedule")
		return
	}

	dayEnd := day.AddDate(0, 0, 1)
	type span struct{ start, end time.Time }
	var booked []span
	arows, err := h.DB.Query(ctx, `
		SELECT starts_at, ends_at FROM appointments
		WHERE barber_id = $1 AND status <> 'cancelled'
		  AND starts_at < $3 AND ends_at > $2`,
		barberID, day, dayEnd)
	if err != nil {
		writeSlotsError(w, http.StatusInternalServerError,
			"Unable to load appointments")
		return
	}
	for arows.Next() {
		var s span
		if arows.Scan(&s.start, &s.end) != nil {
			arows.Close()
			writeSlotsError(w, http.StatusInternalServerError,
				"Unable to read appointments")
			return
		}
		booked = append(booked, s)
	}
	arows.Close()
	if arows.Err() != nil {
		writeSlotsError(w, http.StatusInternalServerError,
			"Unable to read appointments")
		return
	}

	length := time.Duration(duration) * time.Minute
	step := slotStepMinutes * time.Minute
	slots := []Slot{}
	for _, b := range blocks {
		for t := b.start; !t.Add(length).After(b.end); t = t.Add(step) {
			end := t.Add(length)
			reason := ""
			if !t.After(now) {
				reason = "past"
			}
			if b.hasLunch && t.Before(b.lunchEnd) && end.After(b.lunchStart) {
				reason = "lunch"
			}
			for _, s := range booked {
				if t.Before(s.end) && end.After(s.start) {
					reason = "booked"
					break
				}
			}
			slots = append(slots, Slot{
				StartsAt:  t.Format(time.RFC3339),
				Time:      t.Format("15:04"),
				Available: reason == "",
				Reason:    reason,
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(SlotsResponse{
		Date:            day.Format("2006-01-02"),
		Timezone:        loc.String(),
		DurationMinutes: duration,
		Slots:           slots,
	})
}

type rowQuerier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// WithinBarberHours reports whether a 15-minute-aligned appointment from
// start to end falls entirely inside one of the barber's active blocks for
// that weekday, evaluated in the shop's time zone.
func WithinBarberHours(
	ctx context.Context, q rowQuerier, barberID int64, start, end time.Time,
) (bool, error) {
	loc := ShopLocation()
	ls, le := start.In(loc), end.In(loc)

	if ls.Second() != 0 || ls.Nanosecond() != 0 ||
		ls.Minute()%slotStepMinutes != 0 {
		return false, nil
	}
	if ls.Year() != le.Year() || ls.YearDay() != le.YearDay() {
		return false, nil
	}

	rows, err := q.Query(ctx, `
		SELECT to_char(start_time, 'HH24:MI'), to_char(end_time, 'HH24:MI'),
		       to_char(lunch_start, 'HH24:MI'), to_char(lunch_end, 'HH24:MI')
		FROM barber_availability
		WHERE barber_id = $1 AND day_of_week = $2 AND is_active`,
		barberID, int(ls.Weekday()))
	if err != nil {
		return false, err
	}
	defer rows.Close()

	minutes := func(hm string) (int, bool) {
		t, err := time.Parse("15:04", hm)
		return t.Hour()*60 + t.Minute(), err == nil
	}
	from := ls.Hour()*60 + ls.Minute()
	to := le.Hour()*60 + le.Minute()
	for rows.Next() {
		var s, e string
		var lunchS, lunchE *string
		if err := rows.Scan(&s, &e, &lunchS, &lunchE); err != nil {
			return false, err
		}
		bs, ok1 := minutes(s)
		be, ok2 := minutes(e)
		if !ok1 || !ok2 || from < bs || to > be {
			continue
		}
		if lunchS != nil && lunchE != nil {
			l1, ok3 := minutes(*lunchS)
			l2, ok4 := minutes(*lunchE)
			if ok3 && ok4 && from < l2 && to > l1 {
				continue
			}
		}
		return true, nil
	}
	return false, rows.Err()
}
