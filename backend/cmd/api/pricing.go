package main

import (
	"context"
)

type priceLine struct {
	Name            string `json:"name"`
	PriceCents      int    `json:"priceCents"`
	DurationMinutes int    `json:"durationMinutes"`
}

type priceBreakdown struct {
	Service      priceLine   `json:"service"`
	AddOns       []priceLine `json:"addOns"`
	TotalCents   int         `json:"totalCents"`
	TotalMinutes int         `json:"totalMinutes"`
}

// buildBreakdown totals the service and its add-ons.
func buildBreakdown(service priceLine, addOns []priceLine) priceBreakdown {
	if addOns == nil {
		addOns = []priceLine{}
	}
	b := priceBreakdown{
		Service:      service,
		AddOns:       addOns,
		TotalCents:   service.PriceCents,
		TotalMinutes: service.DurationMinutes,
	}
	for _, a := range addOns {
		b.TotalCents += a.PriceCents
		b.TotalMinutes += a.DurationMinutes
	}
	return b
}

func addOnNames(lines []priceLine) []string {
	names := make([]string, 0, len(lines))
	for _, l := range lines {
		names = append(names, l.Name)
	}
	return names
}

// loadAddOnLines returns the add-ons saved on each appointment, using the
// price and duration captured at booking time.
func (a *App) loadAddOnLines(ctx context.Context, ids []int64) (map[int64][]priceLine, error) {
	out := map[int64][]priceLine{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := a.db.Query(ctx,
		`SELECT aa.appointment_id, a.name, aa.price_cents, aa.duration_minutes
		 FROM appointment_addons aa JOIN addons a ON a.id=aa.addon_id
		 WHERE aa.appointment_id = ANY($1) ORDER BY aa.appointment_id, a.id`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var l priceLine
		if err := rows.Scan(&id, &l.Name, &l.PriceCents, &l.DurationMinutes); err != nil {
			return nil, err
		}
		out[id] = append(out[id], l)
	}
	return out, rows.Err()
}
