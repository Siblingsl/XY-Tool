# Build stage（GOTOOLCHAIN=auto 兼容 go.mod toolchain）
FROM golang:1.24-alpine AS builder

WORKDIR /app
ENV GOTOOLCHAIN=auto

RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /api ./cmd/api

# Runtime stage
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /api /app/api
COPY migrations/ /app/migrations/

ENV PORT=8080

EXPOSE 8080

CMD ["/app/api"]
