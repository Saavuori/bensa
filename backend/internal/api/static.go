package api

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"strings"
)

// The production image builds the Vite frontend into this directory (see
// Dockerfile). In a plain checkout it holds only .gitkeep, so `go build` still
// works locally — the backend then just serves nothing but the API, which is
// what the Vite dev server expects anyway.
//
//go:embed all:dist
var distFS embed.FS

// ServeStatic serves the embedded frontend build, falling back to index.html so
// deep links keep working (the app has no router today, but a direct hit on any
// non-asset path should still load the map rather than 404).
func ServeStatic(w http.ResponseWriter, r *http.Request) {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		log.Printf("failed to get dist FS sub: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Unknown /api/* paths must never fall through to index.html — an API
	// client asking for a route that doesn't exist deserves a 404, not HTML.
	if strings.HasPrefix(r.URL.Path, "/api/") {
		http.NotFound(w, r)
		return
	}

	upath := strings.TrimPrefix(r.URL.Path, "/")
	if upath == "" {
		upath = "index.html"
	}
	if _, err := fs.Stat(sub, upath); err != nil {
		if _, err := fs.Stat(sub, "index.html"); err != nil {
			http.NotFound(w, r)
			return
		}
		r = r.Clone(r.Context())
		r.URL.Path = "/"
	}

	http.FileServer(http.FS(sub)).ServeHTTP(w, r)
}
