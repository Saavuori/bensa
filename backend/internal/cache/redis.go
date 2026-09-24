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
// request. The value is mirrored in memory so a Redis outage never turns into
// an error page or a slow one.
type RedisCache struct {
	client *redis.Client

	mu       sync.RWMutex
	trendMem *models.Trend
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
	r.trendMem = &trend
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

// GetTrend prefers the in-memory copy. The poller writes memory before Redis,
// so within one process it is never older than what Redis holds (and newer when
// a Redis write failed), and reading it costs no round trip — which matters in
// a Redis outage, where every call would first wait out the client's dial
// retries. Redis only covers the window after a restart, until the new
// process's first poll lands.
func (r *RedisCache) GetTrend(ctx context.Context) (models.Trend, bool) {
	r.mu.RLock()
	mem := r.trendMem
	r.mu.RUnlock()
	if mem != nil {
		return *mem, true
	}

	bytes, err := r.client.Get(ctx, trendKey).Bytes()
	if err != nil {
		return models.Trend{}, false
	}
	var trend models.Trend
	if err := json.Unmarshal(bytes, &trend); err != nil {
		log.Printf("Redis returned unparseable trend payload: %v", err)
		return models.Trend{}, false
	}
	return trend, true
}
