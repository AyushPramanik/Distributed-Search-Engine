package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/ayushpramanik/distributed-search-engine/shared/types"
)

const defaultTTL = 5 * time.Minute

// QueryCache wraps Redis for transparent query result caching.
type QueryCache struct {
	client *redis.Client
	ttl    time.Duration
}

func New(addr, password string, db int) *QueryCache {
	rdb := redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           db,
		DialTimeout:  3 * time.Second,
		ReadTimeout:  2 * time.Second,
		WriteTimeout: 2 * time.Second,
		PoolSize:     16,
	})
	return &QueryCache{client: rdb, ttl: defaultTTL}
}

func (c *QueryCache) cacheKey(query string, page, pageSize int, algo string) string {
	return fmt.Sprintf("search:%s:%d:%d:%s", query, page, pageSize, algo)
}

// Get returns a cached response and true, or nil and false on miss/error.
func (c *QueryCache) Get(ctx context.Context, query string, page, pageSize int, algo string) (*types.SearchResponse, bool) {
	key := c.cacheKey(query, page, pageSize, algo)
	data, err := c.client.Get(ctx, key).Bytes()
	if err != nil {
		return nil, false
	}
	var resp types.SearchResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, false
	}
	return &resp, true
}

// Set stores a search response in the cache.
func (c *QueryCache) Set(ctx context.Context, query string, page, pageSize int, algo string, resp *types.SearchResponse) {
	key := c.cacheKey(query, page, pageSize, algo)
	data, err := json.Marshal(resp)
	if err != nil {
		return
	}
	_ = c.client.Set(ctx, key, data, c.ttl).Err()
}

// Invalidate flushes all cached search results.
func (c *QueryCache) Invalidate(ctx context.Context) error {
	var cursor uint64
	for {
		keys, next, err := c.client.Scan(ctx, cursor, "search:*", 100).Result()
		if err != nil {
			return err
		}
		if len(keys) > 0 {
			_ = c.client.Del(ctx, keys...).Err()
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return nil
}

// Ping checks Redis connectivity.
func (c *QueryCache) Ping(ctx context.Context) error {
	return c.client.Ping(ctx).Err()
}
