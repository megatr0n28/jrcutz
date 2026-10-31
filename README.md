# jrcutz
Barber Appt Scheduling Web Application


Complete Sandbox Topology State

All components are executed perfectly on their allocated network namespaces:

|Running Container Handle|	Associated Network Mesh| Active Operational Role|
|:-----------------------|:------------------------:|:---------------------:|
|traefik|	proxy|	Public Edge Router (:80 / :443).|
|kratos|	proxy| internal	Manages active User Identities, Sessions, and Profiles.
|hydra|	proxy| internal	Delegates OAuth2 and OpenID Connect Token flows.
|openfga|	proxy| internal	Evaluates fine-grained ReBAC access permission models.
|api|	proxy| internal	Your custom backend application service container endpoint.|
|authui|	proxy| internal	Custom user-facing UI node for handling Kratos workflows.|
|web|	proxy|	Your main landing page or production frontend container interface.|


## 9. Complete project source
The following is the runnable project foundation. It uses a PostgreSQL exclusion constraint to prevent overlapping appointments for the same barber, bcrypt password hashing, JWT authentication, and server-side role checks.

The frontend and backend run in separate containers. The Angular app calls /api, and Nginx forwards those requests to Go.

## 9.1 Repository layout
```text
jrcutz/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── go.mod
│   ├── cmd/api/main.go
│   └── migrations/001_init.sql
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── angular.json
    ├── tsconfig.json
    ├── tsconfig.app.json
    └── src/
        ├── index.html
        ├── main.ts
        ├── styles.scss
        └── app/
            ├── app.component.ts
            ├── app.component.html
            ├── app.routes.ts
            ├── core/api.service.ts
            ├── core/auth.guard.ts
            ├── pages/home.component.ts
            ├── pages/login.component.ts
            ├── pages/booking.component.ts
            ├── pages/my-bookings.component.ts
            └── pages/admin.component.ts
```

## 9.2 PostgreSQL schema
Create backend/migrations/001_init.sql.

weekday follows PostgreSQL's convention: Sunday is 0, Monday is 1, and Saturday is 6. The sample schedule is illustrative and should be updated to the real shop hours.

## 9.3 Environment and Docker
Create .env.example:
```env
POSTGRES_DB=barbershop
POSTGRES_USER=barbershop
POSTGRES_PASSWORD=replace-with-a-long-random-password
DATABASE_URL=postgres://barbershop:replace-with-a-long-random-password@db:5432/barbershop?sslmode=disable
JWT_SECRET=replace-with-at-least-32-random-bytes
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-unique-strong-password
```

Generate secure secrets before running:
```bash
openssl rand -base64 36
```

Use a different value for the database password, JWT secret, and admin password. Copy the environment file to .env and update all values.

Create docker-compose.yml:
```yaml

services:
  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/migrations/001_init.sql:/docker-entrypoint-initdb.d/001_init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 15

  api:
    build: ./backend
    restart: unless-stopped
    environment:
      DATABASE_URL: ${DATABASE_URL}
      JWT_SECRET: ${JWT_SECRET}
      ADMIN_EMAIL: ${ADMIN_EMAIL}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
    depends_on:
      db:
        condition: service_healthy

  frontend:
    build: ./frontend
    restart: unless-stopped
    ports:
      - "8080:80"
    depends_on:
      - api

volumes:
  postgres_data:
```

Create backend/go.mod:
```go

module barbershop

go 1.26.5

require (
    github.com/golang-jwt/jwt/v5 v5.2.2
    github.com/jackc/pgx/v5 v5.7.2
    golang.org/x/crypto v0.36.0
)
```

Create backend/Dockerfile:
```dockerfile
FROM golang:1.26.5-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./

RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /api ./cmd/api

FROM alpine:3.22

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /api /app/api

EXPOSE 8080

CMD ["/app/api"]
```

## 9.4 Go REST API
Create backend/cmd/api/main.go. This version implements account registration, login, service and barber listings, booking creation, customer booking history, cancellation, and protected admin appointment management.

## 9.5 Angular configuration
Create frontend/package.json:
```json
{
  "name": "barbershop-frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "ng serve --host 0.0.0.0",
    "build": "ng build"
  },
  "dependencies": {
    "@angular/common": "^19.2.0",
    "@angular/compiler": "^19.2.0",
    "@angular/core": "^19.2.0",
    "@angular/forms": "^19.2.0",
    "@angular/platform-browser": "^19.2.0",
    "@angular/router": "^19.2.0",
    "rxjs": "~7.8.0",
    "tslib": "^2.8.0",
    "zone.js": "~0.15.0"
  },
  "devDependencies": {
    "@angular-devkit/build-angular": "^19.2.0",
    "@angular/cli": "^19.2.0",
    "@angular/compiler-cli": "^19.2.0",
    "typescript": "~5.7.2"
  }
}
```
Create frontend/angular.json:
```json
{
  "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
  "version": 1,
  "newProjectRoot": "projects",
  "projects": {
    "barbershop": {
      "projectType": "application",
      "root": "",
      "sourceRoot": "src",
      "prefix": "app",
      "architect": {
        "build": {
          "builder": "@angular-devkit/build-angular:application",
          "options": {
            "outputPath": "dist/barbershop",
            "index": "src/index.html",
            "browser": "src/main.ts",
            "polyfills": ["zone.js"],
            "tsConfig": "tsconfig.app.json",
            "styles": ["src/styles.scss"],
            "assets": [],
            "outputHashing": "all"
          },
          "configurations": {
            "production": {
              "optimization": true,
              "outputHashing": "all",
              "sourceMap": false
            }
          },
          "defaultConfiguration": "production"
        }
      }
    }
  }
}
```
Create frontend/tsconfig.json:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "importHelpers": true,
    "lib": ["ES2022", "dom"]
  },
  "angularCompilerOptions": {
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true,
    "strictTemplates": true
  }
}
```
Create frontend/tsconfig.app.json:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/app",
    "types": []
  },
  "files": ["src/main.ts"]
}
```

## 9.6 Angular API and authentication service
Create frontend/src/app/core/api.service.ts.

This starter keeps the JWT in local storage for simplicity. For a public production site, prefer short-lived access tokens with a secure, HttpOnly, SameSite cookie strategy, CSRF protection where appropriate, and rate limits on login and registration.

Create frontend/src/app/core/auth.guard.ts:
```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApiService } from './api.service';

export const customerGuard: CanActivateFn = () => {
  const api = inject(ApiService);
  const router = inject(Router);
  return api.loggedIn ? true : router.createUrlTree(['/login']);
};

export const adminGuard: CanActivateFn = () => {
  const api = inject(ApiService);
  const router = inject(Router);
  return api.isAdmin ? true : router.createUrlTree(['/login']);
};
```
These guards improve navigation, but the Go middleware remains the security boundary

## 9.7 Application routes and bootstrap
Create frontend/src/app/app.routes.ts:
```ts
import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home.component';
import { LoginComponent } from './pages/login.component';
import { BookingComponent } from './pages/booking.component';
import { MyBookingsComponent } from './pages/my-bookings.component';
import { AdminComponent } from './pages/admin.component';
import { customerGuard, adminGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  {
    path: 'book',
    component: BookingComponent,
    canActivate: [customerGuard]
  },
  {
    path: 'my-bookings',
    component: MyBookingsComponent,
    canActivate: [customerGuard]
  },
  {
    path: 'admin',
    component: AdminComponent,
    canActivate: [adminGuard]
  },
  { path: '**', redirectTo: '' }
];
```

Create frontend/src/main.ts:
```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

bootstrapApplication(AppComponent, {
  providers: [provideHttpClient(), provideRouter(routes)]
}).catch(console.error);
```

Create frontend/src/index.html
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>JR Cutz | Precision Grooming</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#171714">
  <meta name="description"
        content="Precision haircuts, expert grooming, and easy online booking.">
</head>
<body>
  <app-root></app-root>
</body>
</html>
```

## 9.8 Shared navigation
Create frontend/src/app/app.component.ts:
```ts
import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { ApiService } from './core/api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.component.html'
})
export class AppComponent {
  api = inject(ApiService);
  router = inject(Router);

  logout(): void {
    this.api.logout();
    this.router.navigateByUrl('/');
  }
}
```

Create frontend/src/app/app.component.html:
```html
<header class="topbar">
  <a class="brand" routerLink="/">
    <span class="brand-mark">JR</span>
    <span><small>Cutz</small></span>
  </a>

  <nav>
    <a routerLink="/">Home</a>
    <a routerLink="/" fragment="services">Services</a>
    @if (api.loggedIn) {
      <a routerLink="/book">Book</a>
      <a routerLink="/my-bookings">My appointments</a>
    }
    @if (api.isAdmin) {
      <a routerLink="/admin">Admin</a>
    }
  </nav>

  @if (api.loggedIn) {
    <button class="button button-outline" (click)="logout()">Log out</button>
  } @else {
    <a class="button button-gold" routerLink="/login">Sign in</a>
  }
</header>

<main>
  <router-outlet />
</main>

<footer class="footer">
  <a class="brand" routerLink="/">JR Cutz</a>
  <span>Craftsmanship. Confidence. Community.</span>
  <span>© 2026 · Appointment booking</span>
</footer>
```

## 9.9 Homepage
Create frontend/src/app/pages/home.component.ts:

## 9.10 Customer login and registration
Create frontend/src/app/pages/login.component.ts:

## 9.11 Appointment booking
Create frontend/src/app/pages/booking.component.ts:

This booking screen submits a requested time directly. A production version should add a live availability endpoint and display only valid slots based on barber hours, service duration, breaks, and existing bookings.

## 9.12 Customer appointment history
Create frontend/src/app/pages/my-bookings.component.ts:

## 9.13 Admin dashboard
Create frontend/src/app/pages/admin.component.ts:

The dashboard includes appointment review and status management. Service editing, barber editing, reporting, and staff schedule management are not yet implemented as admin screens in this starter.

## 9.14 Responsive visual styling
Create frontend/src/styles.scss:

The homepage's background image and fonts load from external CDNs. Replace these with licensed local assets if you need an entirely self-hosted deployment.

## 9.15 Nginx and frontend Dockerfile
Create frontend/nginx.conf:
```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://api:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
}
```

Create frontend/Dockerfile:
```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/barbershop/browser /usr/share/nginx/html
EXPOSE 80
```

## 10. Run the application
Install Docker Desktop or Docker Engine with the Compose plugin. From the repository root:

1. Create .env from .env.example.
```bash
cp .env.example .env
```

2. Set unique, strong database, JWT, and administrator passwords.

3. cd backend
```bash
cd backend
go mod tidy
cd ..
```

4. Build frontend and backend docker images:
```bash
docker compose build --no-cache api
```
5. Start the application:
```bash
docker compose up --build -d
```
6. You can verify the builder version with:
```bash
docker run --rm golang:1.26.5-alpine go version
```
Expected:
```text
go version go1.26.5 linux/arm64
```

7. Verify that the services are running:
```bash
docker compose ps
docker compose logs -f api
```
8. Open the website at http://localhost:8080 .

Test the API:
```bash
curl http://localhost:8080/api/health
```
The health endpoint should return:
```json
{"status":"ok"}
```
```bash
curl http://localhost:8080/api/services
```
The services endpoint should return:
```json
[{"description":"Classic cuts and modern fades","durationMinutes":30,"id":1,"name":"Precision Haircut","priceCents":3500},{"description":"A tailored haircut and beard finish","durationMinutes":45,"id":2,"name":"Haircut \u0026 Beard","priceCents":5000},{"description":"Beard shaping and detailing","durationMinutes":20,"id":3,"name":"Beard Trim","priceCents":2000},{"description":"Traditional close shave","durationMinutes":30,"id":4,"name":"Hot Towel Shave","priceCents":3000}]
```
```bash
curl http://localhost:8080/api/barbers
```
The barbers endpoint should return:
```json
[{"bio":"Experienced barber focused on detail.","id":1,"imageUrl":"","name":"Barber One","specialty":"Fades and precision cuts"},{"bio":"Classic grooming with a modern finish.","id":2,"imageUrl":"","name":"Barber Two","specialty":"Classic cuts and beard grooming"}]
```
Sign in at /login using the administrator email and password from .env. Customer accounts can be created from the same page.

Important: the SQL initialization script runs automatically only when PostgreSQL initializes a fresh data directory. If you change the schema during development, use versioned migrations rather than expecting Docker Compose to re-run the initialization script.

## 11. Verify the complete booking workflow
Use this sequence to test the initial implementation:
1. Start the stack
  - Confirm the database, Go API, and Angular web server are healthy.

2. Create a customer account
  - Register a customer and verify that login succeeds.

3. Create a booking
  - Select a service, barber, and future date/time.

4. Test conflict prevention
  - Submit another booking for the same barber with an overlapping time. It should return HTTP 409.

5. Review the customer account
  - Verify the booking appears under My appointments.

6. Confirm the booking as admin
  - Sign in as the administrator and change the appointment status.

7. Cancel and verify
  -Cancel a future booking and verify that its time can be booked again.

## 12. What remains before production
This is a substantial starter implementation, but it is important to distinguish working features from production-ready functionality.
|Feature| Current implementation|
|:-----:|:---------------------:|
|Responsive homepage and service menu| Implemented|
|Customer registration and login| Implemented|
|Admin role and protected API endpoints| Implemented|
|Customer booking history and cancellation| Implemented|
|Admin appointment status management| Implemented|
|PostgreSQL persistence| Implemented|
|Concurrent overlapping-booking prevention| Implemented|
|Live available-time search| Not implemented|
|Validation against actual shop opening hours| Not implemented|
|Admin CRUD for services and barbers| Not implemented|
|Staff schedule editor| Not implemented|
|Email/SMS notifications and payment integration| Not implemented|
|Automated integration tests and production deployment hardening| Not implemented|

Before opening this to real customers, I would prioritize live slot availability and shop-hours enforcement, complete the admin management screens, and add automated tests. The current code does not yet validate that a requested time falls within a barber's working hours.