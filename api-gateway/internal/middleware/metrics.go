package middleware

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	httpRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "gateway_http_requests_total",
		Help: "Total HTTP requests processed by the API gateway",
	}, []string{"method", "path", "status"})

	httpRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "gateway_http_request_duration_seconds",
		Help:    "HTTP request latency at the API gateway",
		Buckets: []float64{.001, .005, .010, .025, .050, .100, .250, .500, 1, 2.5, 5},
	}, []string{"method", "path"})

	cacheHitsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "gateway_cache_hits_total",
		Help: "Total Redis cache hits",
	}, []string{"result"})
)

// RecordCacheHit increments the cache hit counter.
func RecordCacheHit()  { cacheHitsTotal.WithLabelValues("hit").Inc() }
func RecordCacheMiss() { cacheHitsTotal.WithLabelValues("miss").Inc() }

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (sw *statusWriter) WriteHeader(code int) {
	sw.status = code
	sw.ResponseWriter.WriteHeader(code)
}

// PrometheusMiddleware records per-route HTTP metrics.
func PrometheusMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t0 := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}

		next.ServeHTTP(sw, r)

		routePattern := chi.RouteContext(r.Context()).RoutePattern()
		if routePattern == "" {
			routePattern = r.URL.Path
		}

		elapsed := time.Since(t0).Seconds()
		status := strconv.Itoa(sw.status)

		httpRequestsTotal.WithLabelValues(r.Method, routePattern, status).Inc()
		httpRequestDuration.WithLabelValues(r.Method, routePattern).Observe(elapsed)
	})
}
