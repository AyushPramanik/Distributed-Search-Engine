#!/usr/bin/env bash
# Regenerate Go and validate proto files.
# Requirements: protoc, protoc-gen-go, protoc-gen-go-grpc
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROTO_DIR="$REPO_ROOT/shared-proto"
GEN_GO_DIR="$PROTO_DIR/gen/go"

command -v protoc              >/dev/null 2>&1 || { echo "protoc not found"; exit 1; }
command -v protoc-gen-go       >/dev/null 2>&1 || go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.31.0
command -v protoc-gen-go-grpc  >/dev/null 2>&1 || go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.3.0

mkdir -p "$GEN_GO_DIR"

protoc \
    -I "$PROTO_DIR" \
    --go_out="$GEN_GO_DIR" \
    --go_opt=paths=source_relative \
    --go-grpc_out="$GEN_GO_DIR" \
    --go-grpc_opt=paths=source_relative \
    search/v1/shard.proto

echo "Generated Go proto files in $GEN_GO_DIR"
