FROM golang:1.21-bookworm AS builder

WORKDIR /workspace

# Shared module
COPY shared/go.mod shared/go.mod
COPY shared/        shared/

# Coordinator module
COPY query-coordinator/go.mod query-coordinator/go.mod
COPY query-coordinator/        query-coordinator/

# Workspace file
COPY go.work go.work

WORKDIR /workspace/query-coordinator
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/coordinator ./cmd/coordinator

# ─── Runtime image ─────────────────────────────────────────────────────────────
FROM gcr.io/distroless/static-debian12

COPY --from=builder /bin/coordinator /coordinator

ENV HTTP_PORT=9090
ENV SHARD_ADDRESSES=http://shard-1:8080,http://shard-2:8080,http://shard-3:8080

EXPOSE 9090

ENTRYPOINT ["/coordinator"]
