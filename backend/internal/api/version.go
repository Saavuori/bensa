package api

import (
	"encoding/json"
	"net/http"
)

// Injected at build time via -ldflags (see Dockerfile and the CI workflow).
// Never hardcode these — CI derives them from the git tag it just created.
var (
	Version   = "dev"
	BuildDate = "unknown"
	GitCommit = "unknown"
)

func (h *Handler) HandleGetVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	json.NewEncoder(w).Encode(map[string]string{
		"version":   Version,
		"buildDate": BuildDate,
		"gitCommit": GitCommit,
	})
}

func (h *Handler) HandleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
