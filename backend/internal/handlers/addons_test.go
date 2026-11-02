package handlers

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestParseAddOnIDs(t *testing.T) {
	got, err := ParseAddOnIDs("1, 2,1")
	if err != nil || !reflect.DeepEqual(got, []int64{1, 2}) {
		t.Fatalf("got %v, %v", got, err)
	}
	if got, err := ParseAddOnIDs(""); got != nil || err != nil {
		t.Fatalf("empty = %v, %v", got, err)
	}
	for _, bad := range []string{"x", "0", "-1", "1,,2"} {
		if _, err := ParseAddOnIDs(bad); !errors.Is(err, ErrAddOnUnavailable) {
			t.Errorf("%q should be rejected, got %v", bad, err)
		}
	}
}

func TestResolveAddOns(t *testing.T) {
	ctx := context.Background()
	enh := []any{int64(1), "Enhancements", 500, 5}

	// Nothing requested: no query result needed.
	if got, err := ResolveAddOns(ctx, fakeQuerier{}, 1, nil); got != nil || err != nil {
		t.Fatalf("none = %v, %v", got, err)
	}

	got, err := ResolveAddOns(ctx, fakeQuerier{rows: [][]any{enh}}, 1, []int64{1, 1})
	if err != nil || len(got) != 1 || got[0].Name != "Enhancements" {
		t.Fatalf("got %v, %v", got, err)
	}
	if AddOnMinutes(got) != 5 || got[0].PriceCents != 500 {
		t.Fatalf("wrong totals: %+v", got)
	}

	// The database returned nothing: not offered with this service (e.g. Shape Up).
	if _, err := ResolveAddOns(ctx, fakeQuerier{}, 3, []int64{1}); !errors.Is(err, ErrAddOnUnavailable) {
		t.Fatalf("ineligible service err = %v", err)
	}

	tooMany := make([]int64, maxAddOns+1)
	for i := range tooMany {
		tooMany[i] = int64(i + 1)
	}
	if _, err := ResolveAddOns(ctx, fakeQuerier{}, 1, tooMany); !errors.Is(err, ErrAddOnUnavailable) {
		t.Fatalf("too many err = %v", err)
	}
}
