package api

import (
	"encoding/json"
	"net/http"

	"bensa/internal/cache"
)

type Handler struct {
	cache *cache.RedisCache
}

func NewHandler(c *cache.RedisCache) *Handler {
	return &Handler{cache: c}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}

// HandleGetTrend serves the national monthly averages from Statistics Finland.
// A 503 means the first upstream fetch hasn't succeeded yet — the frontend
// shows a loading state rather than an empty chart, so the distinction matters.
func (h *Handler) HandleGetTrend(w http.ResponseWriter, r *http.Request) {
	trend, ok := h.cache.GetTrend(r.Context())
	if !ok {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error": "price data is not available yet",
		})
		return
	}
	writeJSON(w, http.StatusOK, trend)
}
