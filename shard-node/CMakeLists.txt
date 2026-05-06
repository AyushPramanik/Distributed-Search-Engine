cmake_minimum_required(VERSION 3.20)
project(shard_node CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)

# Compiler hardening flags
add_compile_options(
    -Wall -Wextra -Wpedantic
    -O2
    -fstack-protector-strong
)

include(FetchContent)

FetchContent_Declare(
    nlohmann_json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG        v3.11.3
    GIT_SHALLOW    TRUE
)

FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG        v0.14.1
    GIT_SHALLOW    TRUE
)

FetchContent_MakeAvailable(nlohmann_json httplib)

set(SOURCES
    src/main.cpp
    src/index/tokenizer.cpp
    src/index/inverted_index.cpp
    src/index/scorer.cpp
    src/server/http_server.cpp
    src/metrics/metrics.cpp
)

add_executable(shard_node ${SOURCES})

target_include_directories(shard_node PRIVATE
    ${CMAKE_SOURCE_DIR}/src
    ${nlohmann_json_SOURCE_DIR}/include
    ${httplib_SOURCE_DIR}
)

target_link_libraries(shard_node PRIVATE
    pthread
)

install(TARGETS shard_node DESTINATION bin)
