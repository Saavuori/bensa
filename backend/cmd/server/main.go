package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"bensa/internal/api"
	"bensa/internal/cache"
	"bensa/internal/models"
)

// Statistics Finland publishes the fuel-price table roughly once a month, so
// there is nothing to gain from polling hard. We refresh a few times a day so a
// freshly published month appears within hours, and retry quickly only on
// failure so a transient upstream hiccup doesn't leave us a day stale.
const (
	pollInterval  = 6 * time.Hour
	retryInterval = 10 * time.Minute
	// Full history: table 11xx starts at 2002M01 (~290 months and growing).
	// One request, cached hard — the chart shows the whole series.
	historyMonths = 400
)

const sourceAttribution = "Tilastokeskus, kuluttajahintaindeksi (CC BY 4.0)"

func pollTrend(redisCache *cache.RedisCache) {
	for {
		ctx := context.Background()
		series, err := api.FetchNationalTrend(ctx, historyMonths)
		if err != nil {
			log.Printf("Error fetching national trend: %v", err)
			time.Sleep(retryInterval)
			continue
		}

		trend := models.Trend{
			Series:    series,
			FetchedAt: time.Now().UTC().Format(time.RFC3339),
			Source:    sourceAttribution,
		}
		if err := redisCache.SetTrend(ctx, trend); err != nil {
			log.Printf("Error caching trend: %v", err)
		} else {
			log.Printf("Cached national trend: %d fuel series", len(series))
		}

		time.Sleep(pollInterval)
	}
}

func main() {
	log.Println("Starting bensa backend...")

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}
	redisCache := cache.NewRedisCache(redisURL)

	go pollTrend(redisCache)

	handler := api.NewHandler(redisCache)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/trend", handler.HandleGetTrend)
	mux.HandleFunc("/api/version", handler.HandleGetVersion)
	mux.HandleFunc("/api/health", handler.HandleHealth)

	// Embedded frontend build (production image only — empty in a dev checkout,
	// where Vite serves the frontend and proxies /api here instead).
	mux.HandleFunc("/", api.ServeStatic)

	// Default to :8081, which the frontend dev proxy targets; PORT overrides it
	// in the container.
	addr := ":8081"
	if p := os.Getenv("PORT"); p != "" {
		addr = ":" + p
	}
	log.Printf("Server listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
