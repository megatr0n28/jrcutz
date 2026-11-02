package main

import (
	"reflect"
	"testing"
)

func TestBuildBreakdown(t *testing.T) {
	svc := priceLine{Name: "Precision Haircut", PriceCents: 2500, DurationMinutes: 30}

	plain := buildBreakdown(svc, nil)
	if plain.TotalCents != 2500 || plain.TotalMinutes != 30 {
		t.Fatalf("plain totals = %+v", plain)
	}
	if plain.AddOns == nil || len(plain.AddOns) != 0 {
		t.Fatalf("add-ons must be an empty list, got %#v", plain.AddOns)
	}

	enh := priceLine{Name: "Enhancements", PriceCents: 500, DurationMinutes: 5}
	towel := priceLine{Name: "Hot Towel", PriceCents: 300, DurationMinutes: 5}
	bd := buildBreakdown(svc, []priceLine{enh, towel})
	if bd.TotalCents != 3300 || bd.TotalMinutes != 40 {
		t.Fatalf("totals = %+v", bd)
	}
	if bd.Service != svc || len(bd.AddOns) != 2 {
		t.Fatalf("lines = %+v", bd)
	}
	if got := addOnNames(bd.AddOns); !reflect.DeepEqual(got, []string{"Enhancements", "Hot Towel"}) {
		t.Fatalf("names = %v", got)
	}
}

func TestAddOnNamesEmptyIsNotNil(t *testing.T) {
	if got := addOnNames(nil); got == nil || len(got) != 0 {
		t.Fatalf("got %#v", got)
	}
}
