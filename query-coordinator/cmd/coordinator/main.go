package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/ayushpramanik/distributed-search-engine/query-coordinator/internal/coordinator"
	"github.com/ayushpramanik/distributed-search-engine/shared/types"
)

// ── Prometheus metrics ────────────────────────────────────────────────────────

var (
	searchLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "coordinator_search_latency_us",
		Help:    "End-to-end search latency at the coordinator in microseconds",
		Buckets: []float64{500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000},
	}, []string{"status"})

	searchRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "coordinator_search_requests_total",
		Help: "Total search requests handled by the coordinator",
	}, []string{"status"})

	indexRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "coordinator_index_requests_total",
		Help: "Total document index requests handled by the coordinator",
	}, []string{"status"})
)

// ── Helpers ───────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	shardAddrsRaw := envOr("SHARD_ADDRESSES",
		"http://localhost:8081,http://localhost:8082,http://localhost:8083")
	shardAddrs := strings.Split(shardAddrsRaw, ",")

	port := envOr("HTTP_PORT", "9090")

	coord := coordinator.New(shardAddrs, logger)

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	coord.StartHealthMonitor(ctx)

	// ── Router ──────────────────────────────────────────────────────────────

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	r.Get("/metrics", promhttp.Handler().ServeHTTP)

	r.Get("/v1/health", func(w http.ResponseWriter, req *http.Request) {
		h := coord.ClusterHealth(req.Context())
		code := http.StatusOK
		if !h.Healthy {
			code = http.StatusServiceUnavailable
		}
		writeJSON(w, code, h)
	})

	r.Get("/v1/search", func(w http.ResponseWriter, req *http.Request) {
		t0 := time.Now()
		q := req.URL.Query()
		query := q.Get("q")
		if query == "" {
			writeJSON(w, 400, types.ErrorResponse{Error: "missing query", Code: 400})
			searchRequests.WithLabelValues("error").Inc()
			return
		}

		page := 1
		pageSize := 10
		algo := "bm25"
		if v := q.Get("page"); v != "" {
			_, _ = parseIntParam(v, &page, 1, 1000)
		}
		if v := q.Get("page_size"); v != "" {
			_, _ = parseIntParam(v, &pageSize, 1, 100)
		}
		if v := q.Get("algorithm"); v != "" {
			algo = v
		}

		resp, err := coord.Search(req.Context(), types.SearchRequest{
			Query:     query,
			Page:      page,
			PageSize:  pageSize,
			Algorithm: algo,
		})
		elapsed := time.Since(t0).Microseconds()

		if err != nil {
			searchRequests.WithLabelValues("error").Inc()
			searchLatency.WithLabelValues("error").Observe(float64(elapsed))
			writeJSON(w, 500, types.ErrorResponse{Error: err.Error(), Code: 500})
			return
		}

		resp.LatencyUs = elapsed
		searchRequests.WithLabelValues("ok").Inc()
		searchLatency.WithLabelValues("ok").Observe(float64(elapsed))
		writeJSON(w, 200, resp)
	})

	r.Post("/v1/documents", func(w http.ResponseWriter, req *http.Request) {
		var doc types.Document
		if err := json.NewDecoder(req.Body).Decode(&doc); err != nil {
			writeJSON(w, 400, types.ErrorResponse{Error: "invalid JSON", Code: 400})
			indexRequests.WithLabelValues("error").Inc()
			return
		}
		if doc.ID == "" || doc.Content == "" {
			writeJSON(w, 400, types.ErrorResponse{Error: "id and content required", Code: 400})
			indexRequests.WithLabelValues("error").Inc()
			return
		}
		if doc.Timestamp == 0 {
			doc.Timestamp = time.Now().UnixMilli()
		}

		resp, err := coord.IndexDocument(req.Context(), doc)
		if err != nil {
			indexRequests.WithLabelValues("error").Inc()
			writeJSON(w, 500, types.ErrorResponse{Error: err.Error(), Code: 500})
			return
		}
		indexRequests.WithLabelValues("ok").Inc()
		writeJSON(w, 201, resp)
	})

	r.Delete("/v1/documents/{id}", func(w http.ResponseWriter, req *http.Request) {
		id := chi.URLParam(req, "id")
		resp, err := coord.DeleteDocument(req.Context(), id)
		if err != nil {
			writeJSON(w, 500, types.ErrorResponse{Error: err.Error(), Code: 500})
			return
		}
		if !resp.Success {
			writeJSON(w, 404, resp)
			return
		}
		writeJSON(w, 200, resp)
	})

	// ── Server lifecycle ─────────────────────────────────────────────────────

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("coordinator listening", "port", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	logger.Info("shutting down coordinator")

	shutCtx, shutCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutCancel()
	if err := srv.Shutdown(shutCtx); err != nil {
		logger.Error("shutdown error", "err", err)
	}
}

func parseIntParam(s string, dest *int, min, max int) (int, error) {
	var v int
	if _, err := scanInt(s, &v); err != nil {
		return *dest, err
	}
	if v < min {
		v = min
	}
	if v > max {
		v = max
	}
	*dest = v
	return v, nil
}

func scanInt(s string, v *int) (int, error) {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, nil
		}
		n = n*10 + int(c-'0')
	}
	*v = n
	return n, nil
}
