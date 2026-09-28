/**
 * server.cpp — 五子棋 AI HTTP 服务
 *
 * 用 cpp-httplib (header-only) + nlohmann/json (header-only) 搭建。
 * 启动后监听 http://localhost:8080，提供 POST /api/move 接口。
 *
 * 构建：make setup && make
 * 运行：./gomoku_server
 */

#include "gomoku_ai.h"
#include "random_ai.h"
#include "mcts_ai.h"
#include "httplib.h"
#include "json.hpp"

#include <iostream>
#include <algorithm>
#include <vector>
#include <string>
#include <memory>
#include <stdexcept>

using json = nlohmann::json;

// ── AI 工厂 ──────────────────────────────────────────────
static std::unique_ptr<GomokuAI> createAI(const std::string& type, int thinkTimeMs) {
    if (type == "random") {
        return std::make_unique<RandomAI>();
    }
    if (type == "mcts") {
        return std::make_unique<MCTSAI>(thinkTimeMs);
    }
    throw std::runtime_error("Unknown AI type: " + type);
}

// ── 解析请求、调用 AI、构造响应 ─────────────────────────
static json handleMove(const json& body) {
    // 校验
    if (!body.contains("board") || !body["board"].is_array()) {
        return {{"error", "Missing or invalid 'board' field"}};
    }
    if (!body.contains("size")) {
        return {{"error", "Missing 'size' field"}};
    }
    if (!body.contains("player")) {
        return {{"error", "Missing 'player' field"}};
    }

    int size = body["size"].get<int>();
    int player = body["player"].get<int>();
    if (size <= 0 || size > 30 || (player != 1 && player != 2)) {
        return {{"error", "Invalid board size or player"}};
    }

    // 将 JSON 二维数组展平为一维，并校验棋盘尺寸。
    if (body["board"].size() != static_cast<size_t>(size)) {
        return {{"error", "Board row count does not match size"}};
    }
    std::vector<int> flatBoard;
    flatBoard.reserve(size * size);
    for (const auto& row : body["board"]) {
        if (!row.is_array() || row.size() != static_cast<size_t>(size)) {
            return {{"error", "Board column count does not match size"}};
        }
        for (const auto& cell : row) {
            const int value = cell.get<int>();
            if (value < 0 || value > 2) return {{"error", "Invalid board cell"}};
            flatBoard.push_back(value);
        }
    }

    // 创建 AI 并获取落子。服务端也限制时长，避免请求占用无限资源。
    std::string aiType = body.value("aiType", "random");
    const int requestedThinkTime = body.value("thinkTimeMs", 800);
    const int thinkTimeMs = std::max(50, std::min(requestedThinkTime, 10000));
    auto ai = createAI(aiType, thinkTimeMs);
    GomokuMove move = ai->getMove(flatBoard.data(), size, player);

    if (move.row < 0) {
        return {{"error", "No valid moves"}};
    }

    return {{"row", move.row}, {"col", move.col}};
}

// ── 主函数 ───────────────────────────────────────────────
int main(int argc, char* argv[]) {
    int port = 8080;
    if (argc > 1) {
        port = std::stoi(argv[1]);
    }

    httplib::Server svr;

    // CORS — 允许浏览器跨域访问
    svr.set_pre_routing_handler([](const httplib::Request& req, httplib::Response& res) {
        res.set_header("Access-Control-Allow-Origin", "*");
        res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set_header("Access-Control-Allow-Headers", "Content-Type");
        if (req.method == "OPTIONS") {
            res.status = 204;
            return httplib::Server::HandlerResponse::Handled;
        }
        return httplib::Server::HandlerResponse::Unhandled;
    });

    // 健康检查
    svr.Get("/api/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content("{\"status\":\"ok\"}", "application/json");
    });

    // AI 落子接口
    svr.Post("/api/move", [](const httplib::Request& req, httplib::Response& res) {
        try {
            json body = json::parse(req.body);
            json result = handleMove(body);
            if (result.contains("error")) {
                res.status = 400;
            }
            res.set_content(result.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 500;
            res.set_content(json{{"error", e.what()}}.dump(), "application/json");
        }
    });

    std::cout << "五子棋 AI 服务已启动: http://localhost:" << port << std::endl;
    std::cout << "  POST /api/move   — AI 落子（random / mcts）" << std::endl;
    std::cout << "  GET  /api/health — 健康检查" << std::endl;

    svr.listen("0.0.0.0", port);
    return 0;
}
