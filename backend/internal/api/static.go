package api

import (
	"embed"
	"io/fs"
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

// dist is the build output itself; fs.Sub only fails on an invalid path, and
// "dist" is a constant the embed directive above guarantees.
var (
	dist, _    = fs.Sub(distFS, "dist")
	fileServer = http.FileServer(http.FS(dist))
)

// ServeStatic serves the embedded frontend build, falling back to index.html so
// a direct hit on any non-asset path still loads the app rather than a 404.
func ServeStatic(w http.ResponseWriter, r *http.Request) {
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
	if _, err := fs.Stat(dist, upath); err != nil {
		if _, err := fs.Stat(dist, "index.html"); err != nil {
			http.NotFound(w, r)
			return
		}
		r = r.Clone(r.Context())
		r.URL.Path = "/"
	}

	fileServer.ServeHTTP(w, r)
}
