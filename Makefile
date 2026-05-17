.PHONY: all build up down restart logs clean \
        build-shard build-coordinator build-gateway build-frontend \
        test lint seed-data help

DOCKER_COMPOSE := docker compose
GO             := go
CMAKE          := cmake
NODE           := node

# ─── Top-level targets ────────────────────────────────────────────────────────

all: build

## up: Build and start the full stack (detached)
up:
	$(DOCKER_COMPOSE) up --build -d
	@echo ""
	@echo "  Frontend    → http://localhost:3000"
	@echo "  API Gateway → http://localhost:3001"
	@echo "  Coordinator → http://localhost:9090"
	@echo "  Grafana     → http://localhost:3100  (admin/admin)"
	@echo "  Prometheus  → http://localhost:9091"
	@echo ""

## down: Stop all services
down:
	$(DOCKER_COMPOSE) down

## restart: Rebuild and restart all services
restart: down up

## logs: Follow logs for all services
logs:
	$(DOCKER_COMPOSE) logs -f

## logs-shard: Follow shard logs only
logs-shard:
	$(DOCKER_COMPOSE) logs -f shard-1 shard-2 shard-3

## build: Build all Docker images
build:
	$(DOCKER_COMPOSE) build

# ─── Individual service builds ────────────────────────────────────────────────

## build-shard: Build the C++ shard node image
build-shard:
	$(DOCKER_COMPOSE) build shard-1 shard-2 shard-3

## build-coordinator: Build the Go coordinator image
build-coordinator:
	$(DOCKER_COMPOSE) build coordinator

## build-gateway: Build the Go API gateway image
build-gateway:
	$(DOCKER_COMPOSE) build api-gateway

## build-frontend: Build the Next.js frontend image
build-frontend:
	$(DOCKER_COMPOSE) build frontend

# ─── Local development ────────────────────────────────────────────────────────

## dev-shard: Build C++ shard locally (requires cmake + clang/gcc)
dev-shard:
	cd shard-node && cmake -B build -DCMAKE_BUILD_TYPE=Debug && cmake --build build --parallel

## dev-coordinator: Run coordinator locally (requires running shards)
dev-coordinator:
	cd query-coordinator && $(GO) run ./cmd/coordinator

## dev-gateway: Run API gateway locally (requires coordinator + redis)
dev-gateway:
	cd api-gateway && $(GO) run ./cmd/gateway

## dev-frontend: Run Next.js in development mode
dev-frontend:
	cd frontend && npm run dev

# ─── Testing ──────────────────────────────────────────────────────────────────

## test: Run all Go tests
test:
	cd query-coordinator && $(GO) test ./... -race -count=1
	cd api-gateway       && $(GO) test ./... -race -count=1

## lint: Run Go linters
lint:
	cd query-coordinator && $(GO) vet ./...
	cd api-gateway       && $(GO) vet ./...

# ─── Data seeding ─────────────────────────────────────────────────────────────

## seed-data: Seed the cluster with sample documents
seed-data:
	@bash scripts/seed-data.sh

# ─── Load testing ─────────────────────────────────────────────────────────────

## load-test: Run k6 load tests (requires k6 installed)
load-test:
	cd load-testing && k6 run search-load.js

## load-test-index: Run k6 indexing stress test
load-test-index:
	cd load-testing && k6 run index-load.js

# ─── Proto generation ─────────────────────────────────────────────────────────

## proto: Regenerate Go and C++ code from .proto files (requires buf or protoc)
proto:
	@bash scripts/generate-proto.sh

# ─── Cleanup ──────────────────────────────────────────────────────────────────

## clean: Remove Docker volumes and build artifacts
clean:
	$(DOCKER_COMPOSE) down -v --remove-orphans
	rm -rf shard-node/build
	rm -rf frontend/.next
	cd query-coordinator && $(GO) clean
	cd api-gateway       && $(GO) clean

## help: Show this help
help:
	@grep -E '^## ' Makefile | sed 's/## /  /'
