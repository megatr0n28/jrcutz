package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jrcutz/barbershop/internal/handlers"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type key int

const userKey key = 1

type App struct {
	db     *pgxpool.Pool
	secret []byte
}

type Claims struct {
	UserID int64  `json:"uid"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

func respond(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, message string) {
	respond(w, status, map[string]string{"error": message})
}

func decode(r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 1<<20)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	return d.Decode(v)
}

func (a *App) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			fail(w, http.StatusUnauthorized, "Authentication required")
			return
		}

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(parts[1], claims,
			func(t *jwt.Token) (any, error) {
				if t.Method != jwt.SigningMethodHS256 {
					return nil, errors.New("unexpected signing method")
				}
				return a.secret, nil
			},
			jwt.WithIssuer("barbershop"),
			jwt.WithExpirationRequired(),
		)

		if err != nil || !token.Valid || claims.UserID <= 0 ||
			(claims.Role != "customer" && claims.Role != "admin") {
			fail(w, http.StatusUnauthorized, "Invalid or expired token")
			return
		}

		ctx := context.WithValue(r.Context(), userKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (a *App) admin(next http.Handler) http.Handler {
	return a.auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := r.Context().Value(userKey).(*Claims)
		if !ok || claims == nil || claims.Role != "admin" {
			fail(w, http.StatusForbidden, "Admin access required")
			return
		}
		next.ServeHTTP(w, r)
	}))
}

func (a *App) issueToken(id int64, role string) string {
	now := time.Now()
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{
		UserID: id,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "barbershop",
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(12 * time.Hour)),
		},
	})
	s, _ := t.SignedString(a.secret)
	return s
}

func (a *App) register(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Phone    string `json:"phone"`
		Password string `json:"password"`
	}
	if decode(r, &in) != nil ||
		strings.TrimSpace(in.Name) == "" ||
		!strings.Contains(in.Email, "@") ||
		len(in.Password) < 12 || len(in.Password) > 72 {
		fail(w, http.StatusBadRequest,
			"Provide a name, valid email, and password of 12-72 bytes")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		fail(w, 500, "Could not create account")
		return
	}

	var id int64
	err = a.db.QueryRow(r.Context(),
		`INSERT INTO users(name,email,phone,password_hash)
		 VALUES($1,lower($2),$3,$4) RETURNING id`,
		strings.TrimSpace(in.Name), strings.TrimSpace(in.Email),
		strings.TrimSpace(in.Phone), string(hash)).Scan(&id)
	if err != nil {
		fail(w, http.StatusConflict, "Account could not be created; email may already exist")
		return
	}

	respond(w, http.StatusCreated, map[string]any{
		"token": a.issueToken(id, "customer"),
		"user": map[string]any{
			"id": id, "name": in.Name,
			"email": strings.ToLower(in.Email), "role": "customer",
		},
	})
}

func (a *App) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if decode(r, &in) != nil {
		fail(w, 400, "Invalid request")
		return
	}

	var id int64
	var name, email, hash, role string
	err := a.db.QueryRow(r.Context(),
		`SELECT id,name,email,password_hash,role
		 FROM users WHERE email=lower($1)`,
		strings.TrimSpace(in.Email)).
		Scan(&id, &name, &email, &hash, &role)

	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil {
		fail(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	respond(w, 200, map[string]any{
		"token": a.issueToken(id, role),
		"user": map[string]any{
			"id": id, "name": name, "email": email, "role": role,
		},
	})
}

func (a *App) services(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(),
		`SELECT id,name,description,price_cents,duration_minutes
		 FROM services WHERE active ORDER BY id`)
	if err != nil {
		fail(w, 500, "Could not load services")
		return
	}
	defer rows.Close()

	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var name, description string
		var price, duration int
		if rows.Scan(&id, &name, &description, &price, &duration) != nil {
			fail(w, 500, "Could not read services")
			return
		}
		out = append(out, map[string]any{
			"id": id, "name": name, "description": description,
			"priceCents": price, "durationMinutes": duration,
		})
	}
	if rows.Err() != nil {
		fail(w, 500, "Could not read services")
		return
	}
	respond(w, 200, out)
}

func (a *App) barbers(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(),
		`SELECT id,name,bio,specialty,image_url
		 FROM barbers WHERE active ORDER BY id`)
	if err != nil {
		fail(w, 500, "Could not load barbers")
		return
	}
	defer rows.Close()

	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var name, bio, specialty, imageURL string
		if rows.Scan(&id, &name, &bio, &specialty, &imageURL) != nil {
			fail(w, 500, "Could not read barbers")
			return
		}
		out = append(out, map[string]any{
			"id": id, "name": name, "bio": bio,
			"specialty": specialty, "imageUrl": imageURL,
		})
	}
	if rows.Err() != nil {
		fail(w, 500, "Could not read barbers")
		return
	}
	respond(w, 200, out)
}

func (a *App) createAppointment(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(userKey).(*Claims)
	var in struct {
		ServiceID int64  `json:"serviceId"`
		BarberID  int64  `json:"barberId"`
		StartsAt  string `json:"startsAt"`
		Notes     string `json:"notes"`
	}
	if decode(r, &in) != nil || in.ServiceID <= 0 || in.BarberID <= 0 {
		fail(w, 400, "Invalid booking request")
		return
	}

	start, err := time.Parse(time.RFC3339, in.StartsAt)
	if err != nil || !start.After(time.Now()) ||
		start.After(time.Now().AddDate(0, 3, 0)) {
		fail(w, 400, "Choose a valid future time within 3 months")
		return
	}
	if len(in.Notes) > 500 {
		fail(w, 400, "Notes must be at most 500 characters")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		fail(w, 500, "Could not start booking")
		return
	}
	defer tx.Rollback(r.Context())

	var duration int
	err = tx.QueryRow(r.Context(),
		`SELECT duration_minutes FROM services
		 WHERE id=$1 AND active FOR SHARE`, in.ServiceID).Scan(&duration)
	if err != nil {
		fail(w, 400, "Service unavailable")
		return
	}

	var barberOK bool
	err = tx.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM barbers WHERE id=$1 AND active)`,
		in.BarberID).Scan(&barberOK)
	if err != nil || !barberOK {
		fail(w, 400, "Barber unavailable")
		return
	}

	end := start.Add(time.Duration(duration) * time.Minute)

	inHours, err := handlers.WithinBarberHours(
		r.Context(), tx, in.BarberID, start, end)
	if err != nil {
		fail(w, 500, "Could not verify barber schedule")
		return
	}
	if !inHours {
		fail(w, http.StatusUnprocessableEntity,
			"That time is outside the barber's working hours")
		return
	}

	var id int64
	err = tx.QueryRow(r.Context(),
		`INSERT INTO appointments
		 (customer_id,barber_id,service_id,starts_at,ends_at,notes)
		 VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
		claims.UserID, in.BarberID, in.ServiceID,
		start, end, strings.TrimSpace(in.Notes)).Scan(&id)

	if err != nil {
		// SQLSTATE 23P01 is the PostgreSQL exclusion violation.
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23P01" {
			fail(w, http.StatusConflict, "That barber is already booked")
			return
		}
		fail(w, 500, "Could not create appointment")
		return
	}

	if err = tx.Commit(r.Context()); err != nil {
		fail(w, 500, "Could not confirm booking")
		return
	}
	respond(w, http.StatusCreated, map[string]any{
		"id": id, "status": "pending",
		"startsAt": start, "endsAt": end,
	})
}

func (a *App) myAppointments(w http.ResponseWriter, r *http.Request) {
	c := r.Context().Value(userKey).(*Claims)
	rows, err := a.db.Query(r.Context(),
		`SELECT ap.id, s.name, b.name, ap.starts_at, ap.ends_at,
		        ap.status, s.price_cents
		 FROM appointments ap
		 JOIN services s ON s.id=ap.service_id
		 JOIN barbers b ON b.id=ap.barber_id
		 WHERE ap.customer_id=$1 ORDER BY ap.starts_at DESC`,
		c.UserID)
	if err != nil {
		fail(w, 500, "Could not load appointments")
		return
	}
	defer rows.Close()

	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var service, barber, status string
		var start, end time.Time
		var price int
		if rows.Scan(&id, &service, &barber, &start, &end, &status, &price) != nil {
			fail(w, 500, "Could not read appointments")
			return
		}
		out = append(out, map[string]any{
			"id": id, "service": service, "barber": barber,
			"startsAt": start, "endsAt": end,
			"status": status, "priceCents": price,
		})
	}
	if rows.Err() != nil {
		fail(w, 500, "Could not read appointments")
		return
	}
	respond(w, 200, out)
}

func (a *App) cancelAppointment(w http.ResponseWriter, r *http.Request) {
	c := r.Context().Value(userKey).(*Claims)
	id := r.PathValue("id")

	tag, err := a.db.Exec(r.Context(),
		`UPDATE appointments SET status='cancelled'
		 WHERE id=$1 AND customer_id=$2 AND status IN ('pending','confirmed')
		   AND starts_at > now()`,
		id, c.UserID)
	if err != nil {
		fail(w, 500, "Could not cancel appointment")
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 404, "Appointment not found or cannot be cancelled")
		return
	}
	respond(w, 200, map[string]string{"status": "cancelled"})
}

func (a *App) adminAppointments(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(),
		`SELECT ap.id, u.name, u.email, u.phone, s.name, b.name,
		        ap.starts_at, ap.ends_at, ap.status
		 FROM appointments ap
		 JOIN users u ON u.id=ap.customer_id
		 JOIN services s ON s.id=ap.service_id
		 JOIN barbers b ON b.id=ap.barber_id
		 ORDER BY ap.starts_at DESC LIMIT 500`)
	if err != nil {
		fail(w, 500, "Could not load appointments")
		return
	}
	defer rows.Close()

	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var customer, email, phone, service, barber, status string
		var start, end time.Time
		if rows.Scan(&id, &customer, &email, &phone, &service,
			&barber, &start, &end, &status) != nil {
			fail(w, 500, "Could not read appointments")
			return
		}
		out = append(out, map[string]any{
			"id": id, "customer": customer, "email": email, "phone": phone,
			"service": service, "barber": barber,
			"startsAt": start, "endsAt": end, "status": status,
		})
	}
	if rows.Err() != nil {
		fail(w, 500, "Could not read appointments")
		return
	}
	respond(w, 200, out)
}

func (a *App) updateAppointment(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Status string `json:"status"`
	}
	if decode(r, &in) != nil ||
		(in.Status != "confirmed" && in.Status != "completed" &&
			in.Status != "cancelled") {
		fail(w, 400, "Invalid appointment status")
		return
	}

	tag, err := a.db.Exec(r.Context(),
		`UPDATE appointments SET status=$1 WHERE id=$2
		 AND status <> 'cancelled'`,
		in.Status, r.PathValue("id"))
	if err != nil {
		fail(w, 500, "Could not update appointment")
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 404, "Appointment not found")
		return
	}
	respond(w, 200, map[string]string{"status": in.Status})
}

func (a *App) deleteAppointment(w http.ResponseWriter, r *http.Request) {
	tag, err := a.db.Exec(r.Context(),
		`DELETE FROM appointments WHERE id=$1 AND status='cancelled'`, r.PathValue("id"))
	if err != nil {
		fail(w, 500, "Could not delete appointment")
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 409, "Only cancelled appointments can be deleted")
		return
	}
	respond(w, 200, map[string]string{"status": "deleted"})
}

func (a *App) seedAdmin(ctx context.Context) error {
	email := strings.ToLower(strings.TrimSpace(os.Getenv("ADMIN_EMAIL")))
	password := os.Getenv("ADMIN_PASSWORD")
	if email == "" || password == "" {
		return errors.New("ADMIN_EMAIL and ADMIN_PASSWORD are required")
	}
	if len(password) < 16 || len(password) > 72 {
		return errors.New("ADMIN_PASSWORD must be 16-72 bytes")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = a.db.Exec(ctx,
		`INSERT INTO users(name,email,password_hash,role)
		 VALUES('Administrator',$1,$2,'admin')
		 ON CONFLICT(email) DO NOTHING`,
		email, string(hash))
	return err
}

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	secret := os.Getenv("JWT_SECRET")
	if dbURL == "" || len(secret) < 32 {
		log.Fatal("DATABASE_URL and a JWT_SECRET of at least 32 bytes are required")
	}

	db, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.Ping(ctx); err != nil {
		log.Fatal(err)
	}

	app := &App{db: db, secret: []byte(secret)}
	if err := app.seedAdmin(ctx); err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		respond(w, 200, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/services", app.services)
	mux.HandleFunc("GET /api/barbers", app.barbers)
	mux.HandleFunc("GET /api/barbers/{id}/slots",
		(&handlers.SlotsHandler{DB: db}).Get)
	mux.HandleFunc("POST /api/auth/register", app.register)
	mux.HandleFunc("POST /api/auth/login", app.login)

	mux.Handle("GET /api/me/appointments", app.auth(
		http.HandlerFunc(app.myAppointments)))
	mux.Handle("POST /api/appointments", app.auth(
		http.HandlerFunc(app.createAppointment)))
	mux.Handle("DELETE /api/appointments/{id}", app.auth(
		http.HandlerFunc(app.cancelAppointment)))

	mux.Handle("GET /api/admin/appointments", app.admin(
		http.HandlerFunc(app.adminAppointments)))
	mux.Handle("PATCH /api/admin/appointments/{id}", app.admin(
		http.HandlerFunc(app.updateAppointment)))
	mux.Handle("DELETE /api/admin/appointments/{id}", app.admin(
		http.HandlerFunc(app.deleteAppointment)))

	availabilityHandler := &handlers.AvailabilityHandler{
		DB: db,
	}

	mux.Handle(
		"GET /api/admin/barbers/{id}/availability",
		app.admin(http.HandlerFunc(availabilityHandler.Get)),
	)

	mux.Handle(
		"PUT /api/admin/barbers/{id}/availability",
		app.admin(http.HandlerFunc(availabilityHandler.Save)),
	)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		mux.ServeHTTP(w, r)
	})

	log.Println("Barbershop API listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", handler))
}

// Keep the constant-time comparison available for future API key checks;
// it is not a substitute for the JWT authentication middleware.
// var _ = subtle.ConstantTimeCompare
