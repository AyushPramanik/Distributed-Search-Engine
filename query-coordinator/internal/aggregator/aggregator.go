package aggregator

import (
	"sort"

	"github.com/ayushpramanik/distributed-search-engine/shared/types"
)

// Merge combines result sets from multiple shards into one globally ranked list.
// Results are sorted by descending score. Duplicates (same doc ID) are deduplicated
// by keeping the highest-scoring occurrence.
func Merge(shardResponses []types.SearchResponse, page, pageSize int) types.SearchResponse {
	// Deduplicate across shards, keeping max score per doc.
	seen := make(map[string]types.SearchResult, 64)
	totalHits := 0
	var maxLatency int64

	for _, sr := range shardResponses {
		totalHits += sr.TotalHits
		if sr.LatencyUs > maxLatency {
			maxLatency = sr.LatencyUs
		}
		for _, r := range sr.Results {
			if existing, ok := seen[r.ID]; !ok || r.Score > existing.Score {
				seen[r.ID] = r
			}
		}
	}

	// Flatten to slice and sort
	all := make([]types.SearchResult, 0, len(seen))
	for _, r := range seen {
		all = append(all, r)
	}
	sort.Slice(all, func(i, j int) bool {
		return all[i].Score > all[j].Score
	})

	// Paginate the merged global results
	offset := (page - 1) * pageSize
	if offset >= len(all) {
		return types.SearchResponse{
			Results:   []types.SearchResult{},
			TotalHits: totalHits,
			LatencyUs: maxLatency,
		}
	}
	end := offset + pageSize
	if end > len(all) {
		end = len(all)
	}

	return types.SearchResponse{
		Results:   all[offset:end],
		TotalHits: totalHits,
		LatencyUs: maxLatency,
	}
}
