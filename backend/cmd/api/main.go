package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"log"
	"math/big"
	"net/http"
	"os"
	"strconv"
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
	// MustChange limits the token to the change-password endpoint.
	MustChange bool `json:"mcp,omitempty"`
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

		if claims.MustChange && r.URL.Path != changePasswordPath {
			fail(w, http.StatusForbidden, "Password change required")
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
		// Re-check the stored role so demotions apply immediately.
		var role string
		if a.db.QueryRow(r.Context(),
			`SELECT role FROM users WHERE id=$1`, claims.UserID,
		).Scan(&role) != nil || role != "admin" {
			fail(w, http.StatusForbidden, "Admin access required")
			return
		}
		next.ServeHTTP(w, r)
	}))
}

const changePasswordPath = "/api/auth/change-password"

func (a *App) issueToken(id int64, role string, mustChange bool) string {
	now := time.Now()
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{
		UserID:     id,
		Role:       role,
		MustChange: mustChange,
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
		"token": a.issueToken(id, "customer", false),
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
	var mustChange bool
	err := a.db.QueryRow(r.Context(),
		`SELECT id,name,email,password_hash,role,must_change_password
		 FROM users WHERE email=lower($1)`,
		strings.TrimSpace(in.Email)).
		Scan(&id, &name, &email, &hash, &role, &mustChange)

	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil {
		fail(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	respond(w, 200, map[string]any{
		"token": a.issueToken(id, role, mustChange),
		"user": map[string]any{
			"id": id, "name": name, "email": email, "role": role,
			"mustChangePassword": mustChange,
		},
	})
}

func (a *App) changePassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if decode(r, &in) != nil ||
		len(in.NewPassword) < 12 || len(in.NewPassword) > 72 {
		fail(w, http.StatusBadRequest, "New password must be 12-72 bytes")
		return
	}
	if in.NewPassword == in.CurrentPassword {
		fail(w, http.StatusBadRequest,
			"New password must differ from the current password")
		return
	}
	claims, _ := r.Context().Value(userKey).(*Claims)
	if claims == nil {
		fail(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	var name, email, hash, role string
	err := a.db.QueryRow(r.Context(),
		`SELECT name,email,password_hash,role FROM users WHERE id=$1`,
		claims.UserID).Scan(&name, &email, &hash, &role)
	if err != nil {
		fail(w, http.StatusUnauthorized, "Invalid or expired token")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.CurrentPassword)) != nil {
		fail(w, http.StatusForbidden, "Current password is incorrect")
		return
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(in.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		fail(w, 500, "Could not change password")
		return
	}
	if _, err := a.db.Exec(r.Context(),
		`UPDATE users SET password_hash=$1, must_change_password=FALSE WHERE id=$2`,
		string(newHash), claims.UserID); err != nil {
		fail(w, 500, "Could not change password")
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	respond(w, 200, map[string]any{
		"token": a.issueToken(claims.UserID, role, false),
		"user": map[string]any{
			"id": claims.UserID, "name": name, "email": email, "role": role,
			"mustChangePassword": false,
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

func (a *App) addOns(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(),
		`SELECT a.id, a.name, a.description, a.price_cents, a.duration_minutes,
		        COALESCE(array_agg(x.service_id ORDER BY x.service_id)
		                 FILTER (WHERE x.service_id IS NOT NULL), '{}')
		 FROM addons a
		 LEFT JOIN addon_services x ON x.addon_id = a.id
		 WHERE a.active GROUP BY a.id ORDER BY a.id`)
	if err != nil {
		fail(w, 500, "Could not load add-ons")
		return
	}
	defer rows.Close()

	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var name, description string
		var price, duration int
		var serviceIDs []int64
		if rows.Scan(&id, &name, &description, &price, &duration, &serviceIDs) != nil {
			fail(w, 500, "Could not read add-ons")
			return
		}
		out = append(out, map[string]any{
			"id": id, "name": name, "description": description,
			"priceCents": price, "durationMinutes": duration,
			"serviceIds": serviceIDs,
		})
	}
	if rows.Err() != nil {
		fail(w, 500, "Could not read add-ons")
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
		ServiceID int64   `json:"serviceId"`
		AddOnIDs  []int64 `json:"addOnIds"`
		BarberID  int64   `json:"barberId"`
		StartsAt  string  `json:"startsAt"`
		Notes     string  `json:"notes"`
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

	addOns, err := handlers.ResolveAddOns(
		r.Context(), tx, in.ServiceID, in.AddOnIDs)
	if err != nil {
		if errors.Is(err, handlers.ErrAddOnUnavailable) {
			fail(w, http.StatusUnprocessableEntity,
				"That add-on is not available with this service")
		} else {
			fail(w, 500, "Could not verify add-ons")
		}
		return
	}
	duration += handlers.AddOnMinutes(addOns)

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

	if err == nil {
		for _, ao := range addOns {
			if _, err = tx.Exec(r.Context(),
				`INSERT INTO appointment_addons
				 (appointment_id,addon_id,price_cents,duration_minutes)
				 VALUES($1,$2,$3,$4)`,
				id, ao.ID, ao.PriceCents, ao.DurationMinutes); err != nil {
				break
			}
		}
	}
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
		        ap.status, s.price_cents, s.duration_minutes
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

	type item struct {
		id            int64
		barber, state string
		start, end    time.Time
		service       priceLine
	}
	var items []item
	var ids []int64
	for rows.Next() {
		var it item
		if rows.Scan(&it.id, &it.service.Name, &it.barber, &it.start, &it.end,
			&it.state, &it.service.PriceCents, &it.service.DurationMinutes) != nil {
			fail(w, 500, "Could not read appointments")
			return
		}
		items = append(items, it)
		ids = append(ids, it.id)
	}
	if rows.Err() != nil {
		fail(w, 500, "Could not read appointments")
		return
	}
	rows.Close()

	lines, err := a.loadAddOnLines(r.Context(), ids)
	if err != nil {
		fail(w, 500, "Could not read appointments")
		return
	}

	out := []map[string]any{}
	for _, it := range items {
		bd := buildBreakdown(it.service, lines[it.id])
		out = append(out, map[string]any{
			"id": it.id, "service": it.service.Name, "barber": it.barber,
			"startsAt": it.start, "endsAt": it.end,
			"status": it.state, "priceCents": bd.TotalCents,
			"addOns": addOnNames(bd.AddOns), "breakdown": bd,
		})
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
		        ap.starts_at, ap.ends_at, ap.status,
		        s.price_cents, s.duration_minutes
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

	type item struct {
		id                                    int64
		customer, email, phone, barber, state string
		start, end                            time.Time
		service                               priceLine
	}
	var items []item
	var ids []int64
	for rows.Next() {
		var it item
		if rows.Scan(&it.id, &it.customer, &it.email, &it.phone,
			&it.service.Name, &it.barber, &it.start, &it.end, &it.state,
			&it.service.PriceCents, &it.service.DurationMinutes) != nil {
			fail(w, 500, "Could not read appointments")
			return
		}
		items = append(items, it)
		ids = append(ids, it.id)
	}
	if rows.Err() != nil {
		fail(w, 500, "Could not read appointments")
		return
	}
	rows.Close()

	lines, err := a.loadAddOnLines(r.Context(), ids)
	if err != nil {
		fail(w, 500, "Could not read appointments")
		return
	}

	out := []map[string]any{}
	for _, it := range items {
		bd := buildBreakdown(it.service, lines[it.id])
		out = append(out, map[string]any{
			"id": it.id, "customer": it.customer, "email": it.email,
			"phone": it.phone, "service": it.service.Name, "barber": it.barber,
			"addOns": addOnNames(bd.AddOns), "breakdown": bd,
			"priceCents": bd.TotalCents,
			"startsAt":   it.start, "endsAt": it.end, "status": it.state,
		})
	}
	respond(w, 200, out)
}

func (a *App) adminUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(),
		`SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at,
		        COUNT(ap.id)
		 FROM users u
		 LEFT JOIN appointments ap ON ap.customer_id=u.id
		 GROUP BY u.id
		 ORDER BY u.created_at DESC LIMIT 500`)
	if err != nil {
		fail(w, 500, "Could not load users")
		return
	}
	defer rows.Close()

	out := []map[string]any{}
	for rows.Next() {
		var id, appts int64
		var name, email, phone, role string
		var created time.Time
		if rows.Scan(&id, &name, &email, &phone, &role, &created, &appts) != nil {
			fail(w, 500, "Could not read users")
			return
		}
		out = append(out, map[string]any{
			"id": id, "name": name, "email": email, "phone": phone,
			"role": role, "createdAt": created, "appointments": appts,
		})
	}
	if rows.Err() != nil {
		fail(w, 500, "Could not read users")
		return
	}
	respond(w, 200, out)
}

const tempPasswordAlphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"

// generateTempPassword returns a random 16-character password that avoids
// look-alike characters so it is easy to read out over the phone.
func generateTempPassword() (string, error) {
	const length = 16
	out := make([]byte, length)
	max := big.NewInt(int64(len(tempPasswordAlphabet)))
	for i := range out {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		out[i] = tempPasswordAlphabet[n.Int64()]
	}
	return string(out), nil
}

func (a *App) resetUserPassword(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		fail(w, 400, "Invalid user ID")
		return
	}
	claims, _ := r.Context().Value(userKey).(*Claims)
	if claims != nil && claims.UserID == id {
		fail(w, 409, "You cannot reset your own password here")
		return
	}

	temp, err := generateTempPassword()
	if err != nil {
		fail(w, 500, "Could not generate password")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(temp), bcrypt.DefaultCost)
	if err != nil {
		fail(w, 500, "Could not reset password")
		return
	}
	tag, err := a.db.Exec(r.Context(),
		`UPDATE users SET password_hash=$1, must_change_password=TRUE
		 WHERE id=$2`, string(hash), id)
	if err != nil {
		fail(w, 500, "Could not reset password")
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 404, "User not found")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	respond(w, 200, map[string]string{"temporaryPassword": temp})
}

func (a *App) updateUserRole(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Role string `json:"role"`
	}
	if decode(r, &in) != nil ||
		(in.Role != "customer" && in.Role != "admin") {
		fail(w, 400, "Invalid role")
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		fail(w, 400, "Invalid user ID")
		return
	}
	claims, _ := r.Context().Value(userKey).(*Claims)
	if claims != nil && claims.UserID == id {
		fail(w, 409, "You cannot change your own role")
		return
	}

	tag, err := a.db.Exec(r.Context(),
		`UPDATE users SET role=$1 WHERE id=$2`, in.Role, id)
	if err != nil {
		fail(w, 500, "Could not update user")
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 404, "User not found")
		return
	}
	respond(w, 200, map[string]string{"role": in.Role})
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
	mux.HandleFunc("GET /api/addons", app.addOns)
	mux.HandleFunc("GET /api/barbers", app.barbers)
	mux.HandleFunc("GET /api/barbers/{id}/slots",
		(&handlers.SlotsHandler{DB: db}).Get)
	mux.HandleFunc("POST /api/auth/register", app.register)
	mux.HandleFunc("POST /api/auth/login", app.login)
	mux.Handle("POST "+changePasswordPath, app.auth(
		http.HandlerFunc(app.changePassword)))

	mux.Handle("GET /api/me/appointments", app.auth(
		http.HandlerFunc(app.myAppointments)))
	mux.Handle("POST /api/appointments", app.auth(
		http.HandlerFunc(app.createAppointment)))
	mux.Handle("DELETE /api/appointments/{id}", app.auth(
		http.HandlerFunc(app.cancelAppointment)))

	mux.Handle("GET /api/admin/appointments", app.admin(
		http.HandlerFunc(app.adminAppointments)))
	mux.Handle("GET /api/admin/users", app.admin(
		http.HandlerFunc(app.adminUsers)))
	mux.Handle("POST /api/admin/users/{id}/reset-password", app.admin(
		http.HandlerFunc(app.resetUserPassword)))
	mux.Handle("PATCH /api/admin/users/{id}", app.admin(
		http.HandlerFunc(app.updateUserRole)))
	mux.Handle("GET /api/admin/services", app.admin(
		http.HandlerFunc(app.adminServices)))
	mux.Handle("POST /api/admin/services", app.admin(
		http.HandlerFunc(app.createService)))
	mux.Handle("PATCH /api/admin/services/{id}", app.admin(
		http.HandlerFunc(app.updateService)))
	mux.Handle("GET /api/admin/addons", app.admin(
		http.HandlerFunc(app.adminAddOns)))
	mux.Handle("POST /api/admin/addons", app.admin(
		http.HandlerFunc(app.createAddOn)))
	mux.Handle("PATCH /api/admin/addons/{id}", app.admin(
		http.HandlerFunc(app.updateAddOn)))
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
