package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/ayushpramanik/distributed-search-engine/api-gateway/internal/cache"
	gateMiddleware "github.com/ayushpramanik/distributed-search-engine/api-gateway/internal/middleware"
	"github.com/ayushpramanik/distributed-search-engine/shared/types"
)

func envOr(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

// coordinatorClient proxies requests to the coordinator service.
type coordinatorClient struct {
	baseURL string
	http    *http.Client
}

func newCoordinatorClient(addr string) *coordinatorClient {
	return &coordinatorClient{
		baseURL: addr,
		http: &http.Client{
			Timeout: 20 * time.Second,
			Transport: &http.Transport{
				MaxIdleConnsPerHost: 64,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}
}

func (c *coordinatorClient) search(ctx context.Context, q string, page, pageSize int, algo string) (*types.SearchResponse, error) {
	params := url.Values{}
	params.Set("q", q)
	params.Set("page", fmt.Sprintf("%d", page))
	params.Set("page_size", fmt.Sprintf("%d", pageSize))
	if algo != "" {
		params.Set("algorithm", algo)
	}

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		c.baseURL+"/v1/search?"+params.Encode(), nil)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var out types.SearchResponse
	return &out, json.NewDecoder(resp.Body).Decode(&out)
}

func (c *coordinatorClient) indexDocument(ctx context.Context, doc types.Document) (*types.IndexResponse, error) {
	body, _ := json.Marshal(doc)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/v1/documents", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out types.IndexResponse
	return &out, json.NewDecoder(resp.Body).Decode(&out)
}

func (c *coordinatorClient) deleteDocument(ctx context.Context, id string) (*types.DeleteResponse, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodDelete,
		c.baseURL+"/v1/documents/"+url.PathEscape(id), nil)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	var out types.DeleteResponse
	return &out, json.Unmarshal(data, &out)
}

func (c *coordinatorClient) clusterHealth(ctx context.Context) (*types.ClusterHealth, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		c.baseURL+"/v1/health", nil)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out types.ClusterHealth
	return &out, json.NewDecoder(resp.Body).Decode(&out)
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	coordinatorAddr := envOr("COORDINATOR_ADDRESS", "http://localhost:9090")
	redisAddr       := envOr("REDIS_ADDRESS", "localhost:6379")
	redisPassword   := envOr("REDIS_PASSWORD", "")
	port            := envOr("HTTP_PORT", "3001")

	coord := newCoordinatorClient(coordinatorAddr)

	qcache := cache.New(redisAddr, redisPassword, 0)
	cacheEnabled := true
	if err := qcache.Ping(context.Background()); err != nil {
		logger.Warn("Redis not available, caching disabled", "err", err)
		cacheEnabled = false
	}

	// ── Router ──────────────────────────────────────────────────────────────

	r := chi.NewRouter()

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "X-Request-Id"},
		ExposedHeaders:   []string{"X-Request-Id"},
		AllowCredentials: false,
		MaxAge:           300,
	}))
	r.Use(chiMiddleware.RequestID)
	r.Use(chiMiddleware.RealIP)
	r.Use(chiMiddleware.Recoverer)
	r.Use(gateMiddleware.StructuredLogger(logger))
	r.Use(gateMiddleware.PrometheusMiddleware)
	r.Use(chiMiddleware.Timeout(25 * time.Second))

	r.Get("/metrics", promhttp.Handler().ServeHTTP)

	// ── API routes ───────────────────────────────────────────────────────────

	r.Get("/api/health", func(w http.ResponseWriter, req *http.Request) {
		h, err := coord.clusterHealth(req.Context())
		if err != nil {
			writeJSON(w, 502, types.ErrorResponse{Error: "coordinator unavailable", Code: 502})
			return
		}
		code := http.StatusOK
		if !h.Healthy {
			code = http.StatusServiceUnavailable
		}
		writeJSON(w, code, h)
	})

	r.Get("/api/search", func(w http.ResponseWriter, req *http.Request) {
		q := req.URL.Query()
		query := q.Get("q")
		if query == "" {
			writeJSON(w, 400, types.ErrorResponse{Error: "missing parameter: q", Code: 400, Message: "provide a search query"})
			return
		}

		page     := parseIntOr(q.Get("page"), 1, 1, 1000)
		pageSize := parseIntOr(q.Get("page_size"), 10, 1, 100)
		algo     := q.Get("algorithm")

		// Cache lookup
		if cacheEnabled {
			if cached, hit := qcache.Get(req.Context(), query, page, pageSize, algo); hit {
				cached.Cached = true
				gateMiddleware.RecordCacheHit()
				writeJSON(w, 200, cached)
				return
			}
			gateMiddleware.RecordCacheMiss()
		}

		resp, err := coord.search(req.Context(), query, page, pageSize, algo)
		if err != nil {
			writeJSON(w, 502, types.ErrorResponse{Error: err.Error(), Code: 502})
			return
		}

		if cacheEnabled {
			qcache.Set(req.Context(), query, page, pageSize, algo, resp)
		}
		writeJSON(w, 200, resp)
	})

	r.Post("/api/documents", func(w http.ResponseWriter, req *http.Request) {
		var doc types.Document
		if err := json.NewDecoder(req.Body).Decode(&doc); err != nil {
			writeJSON(w, 400, types.ErrorResponse{Error: "invalid JSON", Code: 400})
			return
		}
		if doc.ID == "" || doc.Content == "" {
			writeJSON(w, 400, types.ErrorResponse{Error: "id and content are required", Code: 400})
			return
		}
		if doc.Timestamp == 0 {
			doc.Timestamp = time.Now().UnixMilli()
		}

		resp, err := coord.indexDocument(req.Context(), doc)
		if err != nil {
			writeJSON(w, 502, types.ErrorResponse{Error: err.Error(), Code: 502})
			return
		}

		// Invalidate cache on new document (best-effort)
		if cacheEnabled {
			_ = qcache.Invalidate(req.Context())
		}
		writeJSON(w, 201, resp)
	})

	r.Delete("/api/documents/{id}", func(w http.ResponseWriter, req *http.Request) {
		id := chi.URLParam(req, "id")
		resp, err := coord.deleteDocument(req.Context(), id)
		if err != nil {
			writeJSON(w, 502, types.ErrorResponse{Error: err.Error(), Code: 502})
			return
		}
		if !resp.Success {
			writeJSON(w, 404, resp)
			return
		}
		if cacheEnabled {
			_ = qcache.Invalidate(req.Context())
		}
		writeJSON(w, 200, resp)
	})

	// ── Lifecycle ────────────────────────────────────────────────────────────

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	go func() {
		logger.Info("gateway listening", "port", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	logger.Info("shutting down gateway")
	shutCtx, shutCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutCancel()
	_ = srv.Shutdown(shutCtx)
}

func parseIntOr(s string, def, min, max int) int {
	if s == "" {
		return def
	}
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return def
		}
		n = n*10 + int(c-'0')
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}
