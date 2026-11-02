package main

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/jrcutz/barbershop/internal/handlers"
)

const (
	maxCatalogName            = 80
	maxCatalogDescription     = 500
	maxCatalogPriceCents      = 100000
	maxCatalogDurationMinutes = 480
)

// validateCatalogFields returns a user-facing message, or "" when valid.
func validateCatalogFields(name, description string, priceCents, durationMinutes int) string {
	switch {
	case strings.TrimSpace(name) == "" || utf8.RuneCountInString(name) > maxCatalogName:
		return "Name is required (max 80 characters)"
	case utf8.RuneCountInString(description) > maxCatalogDescription:
		return "Description must be at most 500 characters"
	case priceCents < 0 || priceCents > maxCatalogPriceCents:
		return "Price must be between $0 and $1,000"
	case durationMinutes <= 0 || durationMinutes > maxCatalogDurationMinutes:
		return "Duration must be between 1 and 480 minutes"
	}
	return ""
}

type catalogItem struct {
	ID              int64   `json:"id"`
	Name            string  `json:"name"`
	Description     string  `json:"description"`
	PriceCents      int     `json:"priceCents"`
	DurationMinutes int     `json:"durationMinutes"`
	Active          bool    `json:"active"`
	ServiceIDs      []int64 `json:"serviceIds,omitempty"`
}

type queryRower interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func pathID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil && id > 0
}

func loadService(ctx context.Context, q queryRower, id int64) (catalogItem, error) {
	it := catalogItem{ID: id}
	err := q.QueryRow(ctx,
		`SELECT name,description,price_cents,duration_minutes,active
		 FROM services WHERE id=$1`, id).
		Scan(&it.Name, &it.Description, &it.PriceCents, &it.DurationMinutes, &it.Active)
	return it, err
}

func loadAddOn(ctx context.Context, q queryRower, id int64) (catalogItem, error) {
	it := catalogItem{ID: id}
	err := q.QueryRow(ctx,
		`SELECT a.name,a.description,a.price_cents,a.duration_minutes,a.active,
		        COALESCE(array_agg(x.service_id ORDER BY x.service_id)
		                 FILTER (WHERE x.service_id IS NOT NULL), '{}')
		 FROM addons a LEFT JOIN addon_services x ON x.addon_id=a.id
		 WHERE a.id=$1 GROUP BY a.id`, id).
		Scan(&it.Name, &it.Description, &it.PriceCents, &it.DurationMinutes,
			&it.Active, &it.ServiceIDs)
	return it, err
}

func (a *App) adminServices(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(),
		`SELECT id,name,description,price_cents,duration_minutes,active
		 FROM services ORDER BY id`)
	if err != nil {
		fail(w, 500, "Could not load services")
		return
	}
	defer rows.Close()

	out := []catalogItem{}
	for rows.Next() {
		var it catalogItem
		if rows.Scan(&it.ID, &it.Name, &it.Description, &it.PriceCents,
			&it.DurationMinutes, &it.Active) != nil {
			fail(w, 500, "Could not read services")
			return
		}
		out = append(out, it)
	}
	if rows.Err() != nil {
		fail(w, 500, "Could not read services")
		return
	}
	respond(w, 200, out)
}

func (a *App) createService(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name            string `json:"name"`
		Description     string `json:"description"`
		PriceCents      int    `json:"priceCents"`
		DurationMinutes int    `json:"durationMinutes"`
	}
	if decode(r, &in) != nil {
		fail(w, 400, "Invalid request")
		return
	}
	in.Name, in.Description = strings.TrimSpace(in.Name), strings.TrimSpace(in.Description)
	if msg := validateCatalogFields(in.Name, in.Description, in.PriceCents, in.DurationMinutes); msg != "" {
		fail(w, 400, msg)
		return
	}

	it := catalogItem{Name: in.Name, Description: in.Description,
		PriceCents: in.PriceCents, DurationMinutes: in.DurationMinutes, Active: true}
	if err := a.db.QueryRow(r.Context(),
		`INSERT INTO services(name,description,price_cents,duration_minutes)
		 VALUES($1,$2,$3,$4) RETURNING id`,
		it.Name, it.Description, it.PriceCents, it.DurationMinutes).Scan(&it.ID); err != nil {
		fail(w, 500, "Could not create service")
		return
	}
	respond(w, http.StatusCreated, it)
}

// updateService edits a service. Services are deactivated rather than
// deleted because appointments reference them.
func (a *App) updateService(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		fail(w, 400, "Invalid service ID")
		return
	}
	var in struct {
		Name            *string `json:"name"`
		Description     *string `json:"description"`
		PriceCents      *int    `json:"priceCents"`
		DurationMinutes *int    `json:"durationMinutes"`
		Active          *bool   `json:"active"`
	}
	if decode(r, &in) != nil {
		fail(w, 400, "Invalid request")
		return
	}

	it, err := loadService(r.Context(), a.db, id)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "Service not found")
		return
	} else if err != nil {
		fail(w, 500, "Could not load service")
		return
	}
	if in.Name != nil {
		it.Name = strings.TrimSpace(*in.Name)
	}
	if in.Description != nil {
		it.Description = strings.TrimSpace(*in.Description)
	}
	if in.PriceCents != nil {
		it.PriceCents = *in.PriceCents
	}
	if in.DurationMinutes != nil {
		it.DurationMinutes = *in.DurationMinutes
	}
	if in.Active != nil {
		it.Active = *in.Active
	}
	if msg := validateCatalogFields(it.Name, it.Description, it.PriceCents, it.DurationMinutes); msg != "" {
		fail(w, 400, msg)
		return
	}

	if _, err := a.db.Exec(r.Context(),
		`UPDATE services SET name=$1,description=$2,price_cents=$3,
		        duration_minutes=$4,active=$5 WHERE id=$6`,
		it.Name, it.Description, it.PriceCents, it.DurationMinutes, it.Active, id); err != nil {
		fail(w, 500, "Could not update service")
		return
	}
	respond(w, 200, it)
}

func (a *App) adminAddOns(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(),
		`SELECT a.id,a.name,a.description,a.price_cents,a.duration_minutes,a.active,
		        COALESCE(array_agg(x.service_id ORDER BY x.service_id)
		                 FILTER (WHERE x.service_id IS NOT NULL), '{}')
		 FROM addons a LEFT JOIN addon_services x ON x.addon_id=a.id
		 GROUP BY a.id ORDER BY a.id`)
	if err != nil {
		fail(w, 500, "Could not load add-ons")
		return
	}
	defer rows.Close()

	out := []catalogItem{}
	for rows.Next() {
		var it catalogItem
		if rows.Scan(&it.ID, &it.Name, &it.Description, &it.PriceCents,
			&it.DurationMinutes, &it.Active, &it.ServiceIDs) != nil {
			fail(w, 500, "Could not read add-ons")
			return
		}
		out = append(out, it)
	}
	if rows.Err() != nil {
		fail(w, 500, "Could not read add-ons")
		return
	}
	respond(w, 200, out)
}

func replaceAddOnServices(ctx context.Context, tx pgx.Tx, addOnID int64, serviceIDs []int64) error {
	if _, err := tx.Exec(ctx,
		`DELETE FROM addon_services WHERE addon_id=$1`, addOnID); err != nil {
		return err
	}
	for _, sid := range serviceIDs {
		if _, err := tx.Exec(ctx,
			`INSERT INTO addon_services(addon_id,service_id) VALUES($1,$2)`,
			addOnID, sid); err != nil {
			return err
		}
	}
	return nil
}

// addOnWriteError maps database errors to API responses.
func addOnWriteError(w http.ResponseWriter, err error, fallback string) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505":
			fail(w, http.StatusConflict, "An add-on with that name already exists")
			return
		case "23503":
			fail(w, 400, "One of the selected services does not exist")
			return
		}
	}
	fail(w, 500, fallback)
}

func (a *App) createAddOn(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name            string  `json:"name"`
		Description     string  `json:"description"`
		PriceCents      int     `json:"priceCents"`
		DurationMinutes int     `json:"durationMinutes"`
		ServiceIDs      []int64 `json:"serviceIds"`
	}
	if decode(r, &in) != nil {
		fail(w, 400, "Invalid request")
		return
	}
	in.Name, in.Description = strings.TrimSpace(in.Name), strings.TrimSpace(in.Description)
	if msg := validateCatalogFields(in.Name, in.Description, in.PriceCents, in.DurationMinutes); msg != "" {
		fail(w, 400, msg)
		return
	}
	serviceIDs := handlers.UniqueIDs(in.ServiceIDs)

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		fail(w, 500, "Could not create add-on")
		return
	}
	defer tx.Rollback(r.Context())

	var id int64
	if err := tx.QueryRow(r.Context(),
		`INSERT INTO addons(name,description,price_cents,duration_minutes)
		 VALUES($1,$2,$3,$4) RETURNING id`,
		in.Name, in.Description, in.PriceCents, in.DurationMinutes).Scan(&id); err != nil {
		addOnWriteError(w, err, "Could not create add-on")
		return
	}
	if err := replaceAddOnServices(r.Context(), tx, id, serviceIDs); err != nil {
		addOnWriteError(w, err, "Could not create add-on")
		return
	}
	it, err := loadAddOn(r.Context(), tx, id)
	if err != nil || tx.Commit(r.Context()) != nil {
		fail(w, 500, "Could not create add-on")
		return
	}
	respond(w, http.StatusCreated, it)
}

func (a *App) updateAddOn(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		fail(w, 400, "Invalid add-on ID")
		return
	}
	var in struct {
		Name            *string  `json:"name"`
		Description     *string  `json:"description"`
		PriceCents      *int     `json:"priceCents"`
		DurationMinutes *int     `json:"durationMinutes"`
		Active          *bool    `json:"active"`
		ServiceIDs      *[]int64 `json:"serviceIds"`
	}
	if decode(r, &in) != nil {
		fail(w, 400, "Invalid request")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		fail(w, 500, "Could not update add-on")
		return
	}
	defer tx.Rollback(r.Context())

	it, err := loadAddOn(r.Context(), tx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "Add-on not found")
		return
	} else if err != nil {
		fail(w, 500, "Could not load add-on")
		return
	}
	if in.Name != nil {
		it.Name = strings.TrimSpace(*in.Name)
	}
	if in.Description != nil {
		it.Description = strings.TrimSpace(*in.Description)
	}
	if in.PriceCents != nil {
		it.PriceCents = *in.PriceCents
	}
	if in.DurationMinutes != nil {
		it.DurationMinutes = *in.DurationMinutes
	}
	if in.Active != nil {
		it.Active = *in.Active
	}
	if in.ServiceIDs != nil {
		it.ServiceIDs = handlers.UniqueIDs(*in.ServiceIDs)
	}
	if msg := validateCatalogFields(it.Name, it.Description, it.PriceCents, it.DurationMinutes); msg != "" {
		fail(w, 400, msg)
		return
	}

	if _, err := tx.Exec(r.Context(),
		`UPDATE addons SET name=$1,description=$2,price_cents=$3,
		        duration_minutes=$4,active=$5 WHERE id=$6`,
		it.Name, it.Description, it.PriceCents, it.DurationMinutes, it.Active, id); err != nil {
		addOnWriteError(w, err, "Could not update add-on")
		return
	}
	if in.ServiceIDs != nil {
		if err := replaceAddOnServices(r.Context(), tx, id, it.ServiceIDs); err != nil {
			addOnWriteError(w, err, "Could not update add-on")
			return
		}
	}
	if tx.Commit(r.Context()) != nil {
		fail(w, 500, "Could not update add-on")
		return
	}
	if it.ServiceIDs == nil {
		it.ServiceIDs = []int64{}
	}
	respond(w, 200, it)
}
