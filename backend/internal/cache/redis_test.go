package cache

import (
	"context"
	"errors"
	"net"
	"sync/atomic"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"

	"bensa/internal/models"
)

// newDownCache returns a cache whose Redis is unreachable and a counter of how
// often the client tried to reach it. Each dial stalls briefly, the way a
// Redis that has gone away (rather than refusing connections) does.
func newDownCache() (*RedisCache, *atomic.Int32) {
	var dials atomic.Int32
	client := redis.NewClient(&redis.Options{
		Addr:          "redis.invalid:6379",
		MaxRetries:    -1,
		DialerRetries: 1,
		Dialer: func(ctx context.Context, _, _ string) (net.Conn, error) {
			dials.Add(1)
			time.Sleep(50 * time.Millisecond)
			return nil, errors.New("redis is down")
		},
	})
	return &RedisCache{client: client}, &dials
}

func TestGetTrendServesMemoryWithoutTouchingRedis(t *testing.T) {
	c, dials := newDownCache()
	ctx := context.Background()

	if _, ok := c.GetTrend(ctx); ok {
		t.Fatal("GetTrend on an empty cache with Redis down reported data")
	}

	want := models.Trend{FetchedAt: "2026-09-01T00:00:00Z", Source: "test"}
	if err := c.SetTrend(ctx, want); err != nil {
		t.Fatalf("SetTrend with Redis down should keep the memory copy, got %v", err)
	}

	before := dials.Load()
	for range 5 {
		got, ok := c.GetTrend(ctx)
		if !ok || got.FetchedAt != want.FetchedAt {
			t.Fatalf("GetTrend = %+v, %v; want the memory copy", got, ok)
		}
	}
	if n := dials.Load() - before; n != 0 {
		t.Errorf("GetTrend dialled Redis %d times with a fresh memory copy in hand", n)
	}
}
