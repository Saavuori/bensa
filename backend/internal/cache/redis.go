package cache

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"

	"bensa/internal/models"
)

// RedisCache stands between visitors and the upstream API: the poller writes
// here, handlers read here, and nothing a visitor does triggers an upstream
// request. The value is mirrored in memory so a Redis outage degrades to
// "serving slightly stale data" rather than an error page.
type RedisCache struct {
	client *redis.Client

	mu         sync.RWMutex
	trendFallb *models.Trend
}

const (
	trendKey = "bensa:trend"

	// Generous relative to the poll cadence — the TTL exists to stop truly
	// ancient data being served forever if the poller dies, not to force
	// refreshes. The poller owns the refresh cadence.
	trendTTL = 30 * 24 * time.Hour
)

func NewRedisCache(url string) *RedisCache {
	opts, err := redis.ParseURL(url)
	if err != nil {
		log.Printf("Invalid REDIS_URL %q, falling back to localhost:6379: %v", url, err)
		opts = &redis.Options{Addr: "localhost:6379"}
	}
	return &RedisCache{client: redis.NewClient(opts)}
}

func (r *RedisCache) SetTrend(ctx context.Context, trend models.Trend) error {
	r.mu.Lock()
	r.trendFallb = &trend
	r.mu.Unlock()

	bytes, err := json.Marshal(trend)
	if err != nil {
		return err
	}
	if err := r.client.Set(ctx, trendKey, bytes, trendTTL).Err(); err != nil {
		log.Printf("Redis Set failed for trend (memory fallback holds): %v", err)
	}
	return nil
}

func (r *RedisCache) GetTrend(ctx context.Context) (models.Trend, bool) {
	bytes, err := r.client.Get(ctx, trendKey).Bytes()
	if err == nil {
		var trend models.Trend
		if err := json.Unmarshal(bytes, &trend); err == nil {
			return trend, true
		}
		log.Printf("Redis returned unparseable trend payload: %v", err)
	}

	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.trendFallb != nil {
		return *r.trendFallb, true
	}
	return models.Trend{}, false
}
