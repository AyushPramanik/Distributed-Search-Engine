package shard

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/ayushpramanik/distributed-search-engine/shared/types"
)

// Client wraps HTTP communication with a single shard node.
type Client struct {
	id      string
	address string
	http    *http.Client
}

func NewClient(id, address string, timeout time.Duration) *Client {
	return &Client{
		id:      id,
		address: address,
		http: &http.Client{
			Timeout: timeout,
			Transport: &http.Transport{
				MaxIdleConnsPerHost: 32,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}
}

func (c *Client) ID() string      { return c.id }
func (c *Client) Address() string { return c.address }

// IndexDocument sends a document to the shard for indexing.
func (c *Client) IndexDocument(ctx context.Context, doc types.Document) (*types.IndexResponse, error) {
	body, err := json.Marshal(doc)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.address+"/v1/documents", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("shard %s: %w", c.id, err)
	}
	defer resp.Body.Close()

	var result types.IndexResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	return &result, nil
}

// Search executes a query against this shard.
func (c *Client) Search(ctx context.Context, req types.SearchRequest) (*types.SearchResponse, error) {
	params := url.Values{}
	params.Set("q", req.Query)
	params.Set("page", fmt.Sprintf("%d", req.Page))
	params.Set("page_size", fmt.Sprintf("%d", req.PageSize))
	if req.Algorithm != "" {
		params.Set("algorithm", req.Algorithm)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.address+"/v1/search?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}

	httpResp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("shard %s: %w", c.id, err)
	}
	defer httpResp.Body.Close()

	var result types.SearchResponse
	if err := json.NewDecoder(httpResp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	return &result, nil
}

// DeleteDocument removes a document from this shard.
func (c *Client) DeleteDocument(ctx context.Context, id string) (*types.DeleteResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete,
		c.address+"/v1/documents/"+url.PathEscape(id), nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("shard %s: %w", c.id, err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)

	var result types.DeleteResponse
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	return &result, nil
}

// Health fetches the shard's health report.
func (c *Client) Health(ctx context.Context) (*types.ShardHealth, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.address+"/v1/health", nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return &types.ShardHealth{
			ShardID: c.id,
			Healthy: false,
			Address: c.address,
		}, nil
	}
	defer resp.Body.Close()

	var h types.ShardHealth
	if err := json.NewDecoder(resp.Body).Decode(&h); err != nil {
		return nil, err
	}
	h.ShardID = c.id
	h.Address = c.address
	return &h, nil
}
