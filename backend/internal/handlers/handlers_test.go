package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type fakeRows struct {
	data [][]any
	i    int
}

func (r *fakeRows) Close()                                       {}
func (r *fakeRows) Err() error                                   { return nil }
func (r *fakeRows) CommandTag() pgconn.CommandTag                { return pgconn.CommandTag{} }
func (r *fakeRows) FieldDescriptions() []pgconn.FieldDescription { return nil }
func (r *fakeRows) RawValues() [][]byte                          { return nil }
func (r *fakeRows) Values() ([]any, error)                       { return nil, nil }
func (r *fakeRows) Conn() *pgx.Conn                              { return nil }
func (r *fakeRows) Next() bool {
	r.i++
	return r.i <= len(r.data)
}
func (r *fakeRows) Scan(dest ...any) error {
	row := r.data[r.i-1]
	for i, d := range dest {
		switch p := d.(type) {
		case *int64:
			*p = row[i].(int64)
		case *int:
			*p = row[i].(int)
		case *string:
			*p = row[i].(string)
		case **string:
			if v, ok := row[i].(string); ok {
				*p = &v
			} else {
				*p = nil
			}
		}
	}
	return nil
}

type fakeQuerier struct{ rows [][]any }

func (f fakeQuerier) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return &fakeRows{data: f.rows}, nil
}

func TestShopLocation(t *testing.T) {
	t.Setenv("SHOP_TIMEZONE", "")
	if got := ShopLocation().String(); got != "America/New_York" {
		t.Fatalf("default = %s", got)
	}
	t.Setenv("SHOP_TIMEZONE", "America/Chicago")
	if got := ShopLocation().String(); got != "America/Chicago" {
		t.Fatalf("env = %s", got)
	}
	t.Setenv("SHOP_TIMEZONE", "Not/AZone")
	if got := ShopLocation(); got != time.UTC {
		t.Fatalf("invalid should fall back to UTC, got %s", got)
	}
}

func TestWithinBarberHours(t *testing.T) {
	t.Setenv("SHOP_TIMEZONE", "America/New_York")
	loc := ShopLocation()
	// A Monday in the shop's zone.
	at := func(h, m int) time.Time { return time.Date(2030, 1, 7, h, m, 0, 0, loc) }
	lunch := "12:00"
	lunchEnd := "13:00"
	hours := [][]any{{"09:00", "17:00", lunch, lunchEnd}}

	cases := []struct {
		name       string
		rows       [][]any
		start, end time.Time
		want       bool
	}{
		{"inside hours", hours, at(10, 0), at(10, 30), true},
		{"ends exactly at close", hours, at(16, 30), at(17, 0), true},
		{"before open", hours, at(8, 45), at(9, 15), false},
		{"after close", hours, at(16, 45), at(17, 15), false},
		{"overlaps lunch start", hours, at(11, 45), at(12, 15), false},
		{"inside lunch", hours, at(12, 15), at(12, 45), false},
		{"starts at lunch end", hours, at(13, 0), at(13, 30), true},
		{"ends at lunch start", hours, at(11, 30), at(12, 0), true},
		{"not 15-minute aligned", hours, at(10, 10), at(10, 40), false},
		{"crosses midnight", hours, at(23, 45), at(0, 15).AddDate(0, 0, 1), false},
		{"no hours that day", nil, at(10, 0), at(10, 30), false},
		{"no lunch set", [][]any{{"09:00", "17:00", nil, nil}}, at(12, 0), at(12, 30), true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := WithinBarberHours(context.Background(), fakeQuerier{c.rows}, 1, c.start, c.end)
			if err != nil || got != c.want {
				t.Fatalf("got %v err %v, want %v", got, err, c.want)
			}
		})
	}
}

func TestWithinBarberHoursUsesShopTimezone(t *testing.T) {
	t.Setenv("SHOP_TIMEZONE", "America/New_York")
	// 15:00 UTC on 2030-01-07 is 10:00 AM in New York.
	start := time.Date(2030, 1, 7, 15, 0, 0, 0, time.UTC)
	ok, err := WithinBarberHours(context.Background(),
		fakeQuerier{[][]any{{"09:00", "17:00", nil, nil}}}, 1, start, start.Add(30*time.Minute))
	if err != nil || !ok {
		t.Fatalf("expected inside hours, got %v err %v", ok, err)
	}
}

func TestSlotsGetValidation(t *testing.T) {
	t.Setenv("SHOP_TIMEZONE", "America/New_York")
	h := &SlotsHandler{}
	future := time.Now().In(ShopLocation()).AddDate(0, 6, 0).Format("2006-01-02")
	past := time.Now().In(ShopLocation()).AddDate(0, 0, -2).Format("2006-01-02")

	cases := []struct{ name, id, query, msg string }{
		{"bad barber", "abc", "date=2030-01-01", "Invalid barber ID"},
		{"zero barber", "0", "date=2030-01-01", "Invalid barber ID"},
		{"bad service", "1", "serviceId=x&date=2030-01-01", "Invalid service"},
		{"add-ons without a service", "1", "addOnIds=1&date=" + time.Now().In(ShopLocation()).AddDate(0, 0, 1).Format("2006-01-02"), "Add-ons require a service"},
		{"bad date", "1", "date=nope", "Invalid date"},
		{"past date", "1", "date=" + past, "within the next 3 months"},
		{"too far", "1", "date=" + future, "within the next 3 months"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/barbers/"+c.id+"/slots?"+c.query, nil)
			req.SetPathValue("id", c.id)
			rec := httptest.NewRecorder()
			h.Get(rec, req)
			if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), c.msg) {
				t.Fatalf("code %d body %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestAvailabilitySaveValidation(t *testing.T) {
	h := &AvailabilityHandler{}
	cases := []struct {
		name, body, msg string
		code            int
	}{
		{"bad json", `nope`, "Invalid request body", 400},
		{"unknown field", `[{"dayOfWeek":1,"startTime":"09:00","endTime":"17:00","isActive":true,"x":1}]`, "Invalid request body", 400},
		{"bad day", `[{"dayOfWeek":7,"startTime":"09:00","endTime":"17:00","isActive":true}]`, "Invalid day of week", 400},
		{"end before start", `[{"dayOfWeek":1,"startTime":"17:00","endTime":"09:00","isActive":true}]`, "Invalid availability time", 400},
		{"lunch start only", `[{"dayOfWeek":1,"startTime":"09:00","endTime":"17:00","isActive":true,"lunchStart":"12:00"}]`, "both a lunch start and end", 400},
		{"lunch outside hours", `[{"dayOfWeek":1,"startTime":"09:00","endTime":"17:00","isActive":true,"lunchStart":"16:30","lunchEnd":"17:30"}]`, "Lunch must fall within", 400},
		{"lunch reversed", `[{"dayOfWeek":1,"startTime":"09:00","endTime":"17:00","isActive":true,"lunchStart":"13:00","lunchEnd":"12:00"}]`, "Lunch must fall within", 400},
		{"overlap", `[{"dayOfWeek":1,"startTime":"09:00","endTime":"13:00","isActive":true},{"dayOfWeek":1,"startTime":"12:00","endTime":"17:00","isActive":true}]`, "cannot overlap", 409},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPut, "/api/admin/barbers/1/availability", strings.NewReader(c.body))
			req.SetPathValue("id", "1")
			rec := httptest.NewRecorder()
			h.Save(rec, req)
			if rec.Code != c.code || !strings.Contains(rec.Body.String(), c.msg) {
				t.Fatalf("code %d body %q", rec.Code, rec.Body.String())
			}
		})
	}

	t.Run("bad barber id", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPut, "/", strings.NewReader(`[]`))
		req.SetPathValue("id", "-1")
		rec := httptest.NewRecorder()
		h.Save(rec, req)
		if rec.Code != 400 {
			t.Fatalf("code %d", rec.Code)
		}
	})
}
