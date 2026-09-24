package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// In a checkout dist/ holds only .gitkeep, so there is no index.html: every
// path 404s, and /api/* must 404 rather than ever reaching the SPA fallback.
func TestServeStaticWithoutBuild(t *testing.T) {
	for _, path := range []string{"/", "/some/deep/link", "/api/nope"} {
		rec := httptest.NewRecorder()
		ServeStatic(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusNotFound {
			t.Errorf("GET %s = %d, want 404", path, rec.Code)
		}
	}
}

func TestVersionAndHealthAreJSON(t *testing.T) {
	h := NewHandler(nil)
	for path, fn := range map[string]http.HandlerFunc{"/api/version": h.HandleGetVersion, "/api/health": h.HandleHealth} {
		rec := httptest.NewRecorder()
		fn(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK || rec.Header().Get("Content-Type") != "application/json" {
			t.Errorf("GET %s = %d %q", path, rec.Code, rec.Header().Get("Content-Type"))
		}
	}
}
