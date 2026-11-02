package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestValidateCatalogFields(t *testing.T) {
	long := func(n int) string { return strings.Repeat("x", n) }
	cases := []struct {
		name        string
		n, d        string
		price, mins int
		wantErr     bool
	}{
		{"valid", "Enhancements", "Extras", 500, 5, false},
		{"free is allowed", "Sample", "", 0, 10, false},
		{"max bounds", long(80), long(500), 100000, 480, false},
		{"blank name", "   ", "", 500, 5, true},
		{"name too long", long(81), "", 500, 5, true},
		{"description too long", "A", long(501), 500, 5, true},
		{"negative price", "A", "", -1, 5, true},
		{"price too high", "A", "", 100001, 5, true},
		{"zero duration", "A", "", 500, 0, true},
		{"duration too long", "A", "", 500, 481, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			msg := validateCatalogFields(c.n, c.d, c.price, c.mins)
			if (msg != "") != c.wantErr {
				t.Fatalf("msg = %q, wantErr %v", msg, c.wantErr)
			}
		})
	}
}

func TestPathID(t *testing.T) {
	for raw, want := range map[string]bool{"5": true, "0": false, "-2": false, "x": false, "": false} {
		req := httptest.NewRequest(http.MethodPatch, "/", nil)
		req.SetPathValue("id", raw)
		if _, ok := pathID(req); ok != want {
			t.Errorf("pathID(%q) ok = %v, want %v", raw, ok, want)
		}
	}
}

func TestCatalogHandlersRejectInvalidInputBeforeTouchingTheDatabase(t *testing.T) {
	app := &App{} // nil db: any query would panic, proving validation runs first
	post := func(h http.HandlerFunc, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
		rec := httptest.NewRecorder()
		h(rec, req)
		return rec
	}
	for name, h := range map[string]http.HandlerFunc{
		"service": app.createService, "addon": app.createAddOn,
	} {
		for _, body := range []string{
			`{`,
			`{"name":"","priceCents":500,"durationMinutes":5}`,
			`{"name":"A","priceCents":-5,"durationMinutes":5}`,
			`{"name":"A","priceCents":500,"durationMinutes":0}`,
			`{"name":"A","priceCents":500,"durationMinutes":5,"bogus":1}`,
		} {
			if rec := post(h, body); rec.Code != http.StatusBadRequest {
				t.Errorf("%s %s = %d, want 400", name, body, rec.Code)
			}
		}
	}

	for name, h := range map[string]http.HandlerFunc{
		"update service": app.updateService, "update addon": app.updateAddOn,
	} {
		req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(`{}`))
		req.SetPathValue("id", "abc")
		rec := httptest.NewRecorder()
		h(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s with bad id = %d, want 400", name, rec.Code)
		}
	}
}

func TestCatalogRoutesNeedAnAdminToken(t *testing.T) {
	app := &App{secret: []byte("test-secret-test-secret-test-secret")}
	called := false
	h := app.admin(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true }))

	for _, token := range []string{"", app.issueToken(2, "customer", false)} {
		req := httptest.NewRequest(http.MethodPost, "/api/admin/services", nil)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized && rec.Code != http.StatusForbidden {
			t.Fatalf("token %q = %d, want 401/403", token, rec.Code)
		}
	}
	if called {
		t.Fatal("handler ran without admin access")
	}
}
