package middleware

import (
	"log/slog"
	"net/http"
	"time"
)

// StructuredLogger emits a JSON log line for every request.
func StructuredLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			t0 := time.Now()
			sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}

			next.ServeHTTP(sw, r)

			logger.Info("request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", sw.status,
				"latency_ms", time.Since(t0).Milliseconds(),
				"remote_addr", r.RemoteAddr,
				"request_id", r.Header.Get("X-Request-Id"),
			)
		})
	}
}
