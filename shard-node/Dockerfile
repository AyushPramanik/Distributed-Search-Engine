FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY CMakeLists.txt .
COPY src/ src/

# Pre-fetch dependencies to leverage Docker layer cache
RUN cmake -B cmake-build \
          -DCMAKE_BUILD_TYPE=Release \
          -DCMAKE_CXX_STANDARD=17 \
    && cmake --build cmake-build --parallel $(nproc)

# ─── Runtime image ────────────────────────────────────────────────────────────
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/cmake-build/shard_node /usr/local/bin/shard_node

ENV SHARD_ID=shard-0
ENV HTTP_PORT=8080
ENV WORKER_THREADS=4

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/shard_node"]
