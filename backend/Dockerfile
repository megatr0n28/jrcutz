FROM golang:1.26.5-alpine AS builder

LABEL org.opencontainers.image.source="https://github.com/megatr0n28/jrcutz"
LABEL org.opencontainers.image.maintainer="johnathan.rodgers@gmail.com"

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