# Makefile — 五子棋 C++ AI 服务构建
#
# 使用：
#   make setup   — 下载 header-only 依赖（只需一次）
#   make         — 编译 build/gomoku_server
#   make clean   — 清理构建产物
#
# 构建输出统一放在 build/，与源码隔离。

CXX       := g++
CXXFLAGS  := -std=c++17 -O2 -Wall

BUILD_DIR := build
TARGET    := $(BUILD_DIR)/gomoku_server
SRCS      := server.cpp random_ai.cpp
OBJS      := $(SRCS:%.cpp=$(BUILD_DIR)/%.o)

# header-only 依赖（下载到当前目录）
HTTPLIB_H := httplib.h
JSON_H    := json.hpp

.PHONY: all setup clean

all: $(TARGET)

# ── 链接 ─────────────────────────────────────────────────
$(TARGET): $(OBJS) $(HTTPLIB_H) $(JSON_H) | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) -o $@ $(OBJS) -lpthread

# ── 编译 ─────────────────────────────────────────────────
$(BUILD_DIR)/%.o: %.cpp gomoku_ai.h random_ai.h $(HTTPLIB_H) $(JSON_H) | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) -c -o $@ $<

$(BUILD_DIR):
	@mkdir -p $@

# ── 自动下载 header-only 依赖 ──────────────────────────
setup: $(HTTPLIB_H) $(JSON_H)

$(HTTPLIB_H):
	@echo ">>> 下载 cpp-httplib (header-only HTTP 库)..."
	curl -sL -o $@ https://raw.githubusercontent.com/yhirose/cpp-httplib/master/httplib.h
	@echo "   完成: $@"

$(JSON_H):
	@echo ">>> 下载 nlohmann/json (header-only JSON 库)..."
	curl -sL -o $@ https://raw.githubusercontent.com/nlohmann/json/develop/single_include/nlohmann/json.hpp
	@echo "   完成: $@"

# ── 清理 ─────────────────────────────────────────────────
clean:
	rm -rf $(BUILD_DIR)
