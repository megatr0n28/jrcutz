package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAuthRestrictsTokensThatMustChangePassword(t *testing.T) {
	app := &App{secret: []byte("test-secret-test-secret-test-secret")}
	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	h := app.auth(ok)

	call := func(token, path string) int {
		req := httptest.NewRequest(http.MethodPost, path, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}

	restricted := app.issueToken(1, "customer", true)
	if got := call(restricted, "/api/appointments"); got != http.StatusForbidden {
		t.Fatalf("restricted token on other route = %d, want 403", got)
	}
	if got := call(restricted, changePasswordPath); got != http.StatusOK {
		t.Fatalf("restricted token on change-password = %d, want 200", got)
	}
	normal := app.issueToken(1, "customer", false)
	if got := call(normal, "/api/appointments"); got != http.StatusOK {
		t.Fatalf("normal token = %d, want 200", got)
	}
}

func TestGenerateTempPassword(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 50; i++ {
		p, err := generateTempPassword()
		if err != nil {
			t.Fatal(err)
		}
		if len(p) != 16 {
			t.Fatalf("length %d", len(p))
		}
		for _, c := range p {
			if !strings.ContainsRune(tempPasswordAlphabet, c) {
				t.Fatalf("unexpected character %q", c)
			}
		}
		if strings.ContainsAny(p, "0O1lI") {
			t.Fatalf("look-alike character in %q", p)
		}
		seen[p] = true
	}
	if len(seen) < 50 {
		t.Fatal("passwords are not random")
	}
}
