package handlers

import (
	"context"
	"errors"
	"strconv"
	"strings"
)

const maxAddOns = 10

// ErrAddOnUnavailable means an add-on is unknown, inactive, or not offered
// with the chosen service.
var ErrAddOnUnavailable = errors.New("add-on unavailable for this service")

type AddOn struct {
	ID              int64
	Name            string
	PriceCents      int
	DurationMinutes int
}

// ParseAddOnIDs parses a comma-separated list of IDs, dropping duplicates.
func ParseAddOnIDs(raw string) ([]int64, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	var ids []int64
	for _, part := range strings.Split(raw, ",") {
		id, err := strconv.ParseInt(strings.TrimSpace(part), 10, 64)
		if err != nil || id <= 0 {
			return nil, ErrAddOnUnavailable
		}
		ids = append(ids, id)
	}
	return UniqueIDs(ids), nil
}

// UniqueIDs removes duplicate IDs while keeping order.
func UniqueIDs(ids []int64) []int64 {
	seen := make(map[int64]bool, len(ids))
	out := make([]int64, 0, len(ids))
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

// ResolveAddOns loads the requested add-ons and verifies every one is active
// and offered with the service. Server-side rule: never trust the client.
func ResolveAddOns(
	ctx context.Context, q rowQuerier, serviceID int64, ids []int64,
) ([]AddOn, error) {
	ids = UniqueIDs(ids)
	if len(ids) == 0 {
		return nil, nil
	}
	if len(ids) > maxAddOns {
		return nil, ErrAddOnUnavailable
	}

	rows, err := q.Query(ctx, `
		SELECT a.id, a.name, a.price_cents, a.duration_minutes
		FROM addons a
		JOIN addon_services x ON x.addon_id = a.id
		WHERE a.active AND x.service_id = $1 AND a.id = ANY($2)
		ORDER BY a.id`, serviceID, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []AddOn
	for rows.Next() {
		var a AddOn
		if err := rows.Scan(&a.ID, &a.Name, &a.PriceCents, &a.DurationMinutes); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out) != len(ids) {
		return nil, ErrAddOnUnavailable
	}
	return out, nil
}

// AddOnMinutes sums the extra time the add-ons need.
func AddOnMinutes(addOns []AddOn) int {
	total := 0
	for _, a := range addOns {
		total += a.DurationMinutes
	}
	return total
}
