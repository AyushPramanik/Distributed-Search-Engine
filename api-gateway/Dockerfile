FROM golang:1.21-bookworm AS builder

WORKDIR /workspace

COPY shared/go.mod shared/go.mod
COPY shared/        shared/

COPY api-gateway/go.mod api-gateway/go.mod
COPY api-gateway/        api-gateway/

COPY go.work go.work

WORKDIR /workspace/api-gateway
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/gateway ./cmd/gateway

# ─── Runtime image ─────────────────────────────────────────────────────────────
FROM gcr.io/distroless/static-debian12

COPY --from=builder /bin/gateway /gateway

ENV HTTP_PORT=3001
ENV COORDINATOR_ADDRESS=http://coordinator:9090
ENV REDIS_ADDRESS=redis:6379

EXPOSE 3001

ENTRYPOINT ["/gateway"]
