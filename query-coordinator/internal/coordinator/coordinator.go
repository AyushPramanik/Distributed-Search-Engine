package coordinator

import (
	"context"
	"fmt"
	"hash/fnv"
	"log/slog"
	"sync"
	"time"

	"github.com/ayushpramanik/distributed-search-engine/query-coordinator/internal/aggregator"
	"github.com/ayushpramanik/distributed-search-engine/query-coordinator/internal/shard"
	"github.com/ayushpramanik/distributed-search-engine/shared/types"
)

const (
	shardTimeout   = 5 * time.Second
	healthInterval = 15 * time.Second
)

type shardResult struct {
	resp *types.SearchResponse
	err  error
}

type indexResult struct {
	resp *types.IndexResponse
	err  error
}

// Coordinator orchestrates fan-out queries and document routing across shards.
type Coordinator struct {
	shards  []*shard.Client
	mu      sync.RWMutex
	healthy map[string]bool
	logger  *slog.Logger
}

func New(shardAddresses []string, logger *slog.Logger) *Coordinator {
	clients := make([]*shard.Client, len(shardAddresses))
	healthy := make(map[string]bool, len(shardAddresses))
	for i, addr := range shardAddresses {
		id := fmt.Sprintf("shard-%d", i+1)
		clients[i] = shard.NewClient(id, addr, shardTimeout)
		healthy[id] = true
	}
	return &Coordinator{
		shards:  clients,
		healthy: healthy,
		logger:  logger,
	}
}

// StartHealthMonitor runs periodic health checks in the background.
func (c *Coordinator) StartHealthMonitor(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(healthInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				c.checkAllShards(ctx)
			}
		}
	}()
}

func (c *Coordinator) checkAllShards(ctx context.Context) {
	for _, s := range c.shards {
		go func(sc *shard.Client) {
			hctx, cancel := context.WithTimeout(ctx, 3*time.Second)
			defer cancel()
			h, err := sc.Health(hctx)
			c.mu.Lock()
			defer c.mu.Unlock()
			if err != nil || h == nil || !h.Healthy {
				c.healthy[sc.ID()] = false
			} else {
				c.healthy[sc.ID()] = true
			}
		}(s)
	}
}

// IndexDocument routes a document to the correct shard using consistent hashing.
func (c *Coordinator) IndexDocument(ctx context.Context, doc types.Document) (*types.IndexResponse, error) {
	sc := c.shardForDoc(doc.ID)
	return sc.IndexDocument(ctx, doc)
}

// Search fans out the query to all shards concurrently and merges results.
func (c *Coordinator) Search(ctx context.Context, req types.SearchRequest) (*types.SearchResponse, error) {
	if len(c.shards) == 0 {
		return nil, fmt.Errorf("no shards available")
	}

	// Fan out to all shards in parallel
	ch := make(chan shardResult, len(c.shards))
	for _, sc := range c.shards {
		go func(s *shard.Client) {
			sctx, cancel := context.WithTimeout(ctx, shardTimeout)
			defer cancel()
			// Each shard fetches page 1 with enlarged page_size so the coordinator
			// can re-rank globally. The true pagination is applied post-merge.
			fanReq := req
			fanReq.Page = 1
			fanReq.PageSize = (req.Page * req.PageSize) + req.PageSize
			if fanReq.PageSize < 50 {
				fanReq.PageSize = 50
			}
			resp, err := s.Search(sctx, fanReq)
			ch <- shardResult{resp: resp, err: err}
		}(sc)
	}

	// Collect with per-shard timeout tolerance
	var responses []types.SearchResponse
	failed := 0
	for range c.shards {
		r := <-ch
		if r.err != nil {
			failed++
			c.logger.Warn("shard search failed", "err", r.err)
			continue
		}
		if r.resp != nil {
			responses = append(responses, *r.resp)
		}
	}

	if len(responses) == 0 {
		return nil, fmt.Errorf("all %d shards failed", failed)
	}

	merged := aggregator.Merge(responses, req.Page, req.PageSize)
	merged.Query         = req.Query
	merged.Page          = req.Page
	merged.PageSize      = req.PageSize
	merged.ShardsQueried = len(c.shards)
	merged.ShardsFailed  = failed

	return &merged, nil
}

// DeleteDocument broadcasts the delete to all shards (the document may live on any one).
func (c *Coordinator) DeleteDocument(ctx context.Context, id string) (*types.DeleteResponse, error) {
	ch := make(chan error, len(c.shards))
	for _, sc := range c.shards {
		go func(s *shard.Client) {
			sctx, cancel := context.WithTimeout(ctx, shardTimeout)
			defer cancel()
			_, err := s.DeleteDocument(sctx, id)
			ch <- err
		}(sc)
	}

	var firstErr error
	found := false
	for range c.shards {
		if err := <-ch; err == nil {
			found = true
		} else if firstErr == nil {
			firstErr = err
		}
	}

	if found {
		return &types.DeleteResponse{Success: true, Message: "deleted"}, nil
	}
	if firstErr != nil {
		return nil, firstErr
	}
	return &types.DeleteResponse{Success: false, Message: "document not found"}, nil
}

// ClusterHealth aggregates health from all shards.
func (c *Coordinator) ClusterHealth(ctx context.Context) types.ClusterHealth {
	type healthResult struct {
		h   *types.ShardHealth
		err error
	}
	ch := make(chan healthResult, len(c.shards))
	for _, sc := range c.shards {
		go func(s *shard.Client) {
			hctx, cancel := context.WithTimeout(ctx, 3*time.Second)
			defer cancel()
			t0 := time.Now()
			h, err := s.Health(hctx)
			if h != nil {
				h.Latency = time.Since(t0).Microseconds()
			}
			ch <- healthResult{h: h, err: err}
		}(sc)
	}

	cluster := types.ClusterHealth{
		TotalShards: len(c.shards),
		Shards:      make([]types.ShardHealth, 0, len(c.shards)),
	}
	for range c.shards {
		r := <-ch
		if r.err != nil || r.h == nil {
			cluster.Shards = append(cluster.Shards, types.ShardHealth{Healthy: false})
			continue
		}
		cluster.Shards = append(cluster.Shards, *r.h)
		if r.h.Healthy {
			cluster.HealthyShards++
		}
	}
	cluster.Healthy = cluster.HealthyShards == cluster.TotalShards
	return cluster
}

// shardForDoc maps a document ID to a shard using FNV-32a consistent hashing.
func (c *Coordinator) shardForDoc(docID string) *shard.Client {
	h := fnv.New32a()
	_, _ = h.Write([]byte(docID))
	idx := int(h.Sum32()) % len(c.shards)
	return c.shards[idx]
}
