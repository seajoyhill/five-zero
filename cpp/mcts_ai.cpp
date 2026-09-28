/**
 * mcts_ai.cpp — 蒙特卡洛树搜索五子棋 AI 实现
 */

#include "mcts_ai.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <utility>

namespace {
constexpr int EMPTY = 0;
constexpr int BLACK = 1;
constexpr int WHITE = 2;
constexpr int SEARCH_RADIUS = 2;
constexpr double UCT_EXPLORATION = 1.41421356237;

const int DIRECTIONS[4][2] = {
    {0, 1}, {1, 0}, {1, 1}, {1, -1}
};
}

MCTSAI::MCTSAI(int thinkTimeMs)
    : thinkTimeMs_(std::max(50, thinkTimeMs)),
      rng_(static_cast<unsigned>(
          std::chrono::steady_clock::now().time_since_epoch().count()))
{}

bool MCTSAI::Node::isTerminal() const {
    return winner != EMPTY || MCTSAI::countEmpty(board) == 0;
}

int MCTSAI::opponent(int player) {
    return player == BLACK ? WHITE : BLACK;
}

bool MCTSAI::inside(int size, int row, int col) {
    return row >= 0 && row < size && col >= 0 && col < size;
}

int MCTSAI::indexOf(int size, int row, int col) {
    return row * size + col;
}

int MCTSAI::countEmpty(const std::vector<int>& board) {
    return static_cast<int>(std::count(board.begin(), board.end(), EMPTY));
}

bool MCTSAI::hasFive(
    const std::vector<int>& board, int size, int row, int col, int player) {
    for (const auto& direction : DIRECTIONS) {
        int count = 1;
        for (int step = 1; step <= 4; ++step) {
            int r = row + direction[0] * step;
            int c = col + direction[1] * step;
            if (inside(size, r, c) && board[indexOf(size, r, c)] == player) {
                ++count;
            } else {
                break;
            }
        }
        for (int step = 1; step <= 4; ++step) {
            int r = row - direction[0] * step;
            int c = col - direction[1] * step;
            if (inside(size, r, c) && board[indexOf(size, r, c)] == player) {
                ++count;
            } else {
                break;
            }
        }
        if (count >= 5) return true;
    }
    return false;
}

bool MCTSAI::isWinningMove(
    std::vector<int>& board, int size, const GomokuMove& move, int player) const {
    const int index = indexOf(size, move.row, move.col);
    board[index] = player;
    const bool result = hasFive(board, size, move.row, move.col, player);
    board[index] = EMPTY;
    return result;
}

std::vector<GomokuMove> MCTSAI::candidateMoves(
    std::vector<int>& board, int size, int player, int maxCandidates) const {
    std::vector<GomokuMove> occupied;
    occupied.reserve(size * size);
    for (int row = 0; row < size; ++row) {
        for (int col = 0; col < size; ++col) {
            if (board[indexOf(size, row, col)] != EMPTY) {
                occupied.push_back({row, col});
            }
        }
    }

    if (occupied.empty()) {
        const int center = size / 2;
        return {{center, center}};
    }

    std::vector<bool> marked(size * size, false);
    std::vector<GomokuMove> moves;
    for (const auto& stone : occupied) {
        for (int dr = -SEARCH_RADIUS; dr <= SEARCH_RADIUS; ++dr) {
            for (int dc = -SEARCH_RADIUS; dc <= SEARCH_RADIUS; ++dc) {
                const int row = stone.row + dr;
                const int col = stone.col + dc;
                if (!inside(size, row, col)) continue;
                const int index = indexOf(size, row, col);
                if (board[index] == EMPTY && !marked[index]) {
                    marked[index] = true;
                    moves.push_back({row, col});
                }
            }
        }
    }

    struct ScoredMove {
        GomokuMove move;
        int score;
    };
    std::vector<ScoredMove> scored;
    scored.reserve(moves.size());
    const int other = opponent(player);
    const double center = (size - 1) / 2.0;

    for (const auto& move : moves) {
        int ownNearby = 0;
        int otherNearby = 0;
        for (int dr = -SEARCH_RADIUS; dr <= SEARCH_RADIUS; ++dr) {
            for (int dc = -SEARCH_RADIUS; dc <= SEARCH_RADIUS; ++dc) {
                if (dr == 0 && dc == 0) continue;
                const int row = move.row + dr;
                const int col = move.col + dc;
                if (!inside(size, row, col)) continue;
                const int value = board[indexOf(size, row, col)];
                if (value == player) ++ownNearby;
                if (value == other) ++otherNearby;
            }
        }
        const bool winning = isWinningMove(board, size, move, player);
        const bool blocking = !winning && isWinningMove(board, size, move, other);
        const int centerDistance = static_cast<int>(
            std::abs(move.row - center) + std::abs(move.col - center));
        const int score = (winning ? 100000 : 0) + (blocking ? 50000 : 0) +
            ownNearby * 12 + otherNearby * 8 - centerDistance;
        scored.push_back({move, score});
    }

    std::sort(scored.begin(), scored.end(), [](const ScoredMove& left, const ScoredMove& right) {
        return left.score > right.score;
    });

    const int count = std::min<int>(maxCandidates, scored.size());
    std::vector<GomokuMove> result;
    result.reserve(count);
    for (int i = 0; i < count; ++i) result.push_back(scored[i].move);
    return result;
}

std::vector<GomokuMove> MCTSAI::immediateMoves(
    std::vector<int>& board, int size, const std::vector<GomokuMove>& moves, int player) const {
    std::vector<GomokuMove> result;
    for (const auto& move : moves) {
        if (isWinningMove(board, size, move, player)) result.push_back(move);
    }
    return result;
}

MCTSAI::Node* MCTSAI::selectChild(Node* node) const {
    Node* best = nullptr;
    double bestScore = -std::numeric_limits<double>::infinity();
    for (const auto& child : node->children) {
        if (child->visits == 0) return child.get();
        const double exploitation = child->wins / child->visits;
        const double exploration = UCT_EXPLORATION * std::sqrt(
            std::log(std::max(1, node->visits)) / child->visits);
        const double score = exploitation + exploration;
        if (score > bestScore) {
            bestScore = score;
            best = child.get();
        }
    }
    return best ? best : node->children.front().get();
}

double MCTSAI::rollout(const Node* node, int maxDepth) {
    if (node->winner != EMPTY) {
        return node->winner == node->rootPlayer ? 1.0 : 0.0;
    }

    std::vector<int> board = node->board;
    int player = node->playerToMove;
    for (int depth = 0; depth < maxDepth; ++depth) {
        auto moves = candidateMoves(board, node->size, player, 40);
        if (moves.empty()) return 0.5;

        auto wins = immediateMoves(board, node->size, moves, player);
        GomokuMove move;
        if (!wins.empty()) {
            std::uniform_int_distribution<size_t> dist(0, wins.size() - 1);
            move = wins[dist(rng_)];
        } else {
            const int other = opponent(player);
            auto blocks = immediateMoves(board, node->size, moves, other);
            const auto& pool = blocks.empty() ? moves : blocks;
            const size_t poolSize = std::min<size_t>(8, pool.size());
            std::uniform_int_distribution<size_t> dist(0, poolSize - 1);
            move = pool[dist(rng_)];
        }

        board[indexOf(node->size, move.row, move.col)] = player;
        if (hasFive(board, node->size, move.row, move.col, player)) {
            return player == node->rootPlayer ? 1.0 : 0.0;
        }
        if (countEmpty(board) == 0) return 0.5;
        player = opponent(player);
    }
    return 0.5;
}

GomokuMove MCTSAI::getMove(const int* board, int size, int player) {
    std::vector<int> rootBoard(board, board + size * size);
    if (countEmpty(rootBoard) == 0) return {-1, -1};

    const int maxCandidates = thinkTimeMs_ >= 2500 ? 64 : (thinkTimeMs_ >= 1200 ? 52 : 40);
    auto rootMoves = candidateMoves(rootBoard, size, player, maxCandidates);
    if (rootMoves.empty()) return {-1, -1};

    auto wins = immediateMoves(rootBoard, size, rootMoves, player);
    if (!wins.empty()) {
        std::uniform_int_distribution<size_t> dist(0, wins.size() - 1);
        return wins[dist(rng_)];
    }
    auto blocks = immediateMoves(rootBoard, size, rootMoves, opponent(player));
    if (!blocks.empty()) {
        std::uniform_int_distribution<size_t> dist(0, blocks.size() - 1);
        return blocks[dist(rng_)];
    }

    auto root = std::make_unique<Node>();
    root->board = std::move(rootBoard);
    root->size = size;
    root->playerToMove = player;
    root->rootPlayer = player;
    root->untriedMoves = std::move(rootMoves);

    const auto deadline = std::chrono::steady_clock::now() +
        std::chrono::milliseconds(thinkTimeMs_);
    const int maxDepth = thinkTimeMs_ >= 2500 ? 96 : (thinkTimeMs_ >= 1200 ? 80 : 64);

    do {
        Node* node = root.get();
        while (!node->isTerminal() && node->untriedMoves.empty() && !node->children.empty()) {
            node = selectChild(node);
        }

        if (!node->isTerminal() && !node->untriedMoves.empty()) {
            std::uniform_int_distribution<size_t> dist(0, node->untriedMoves.size() - 1);
            const size_t moveIndex = dist(rng_);
            const GomokuMove move = node->untriedMoves[moveIndex];
            node->untriedMoves.erase(node->untriedMoves.begin() + moveIndex);

            auto child = std::make_unique<Node>();
            child->board = node->board;
            child->size = size;
            child->playerToMove = opponent(node->playerToMove);
            child->rootPlayer = player;
            child->parent = node;
            child->move = move;
            child->board[indexOf(size, move.row, move.col)] = node->playerToMove;
            if (hasFive(child->board, size, move.row, move.col, node->playerToMove)) {
                child->winner = node->playerToMove;
            } else if (countEmpty(child->board) > 0) {
                child->untriedMoves = candidateMoves(
                    child->board, size, child->playerToMove, maxCandidates);
            }
            node->children.push_back(std::move(child));
            node = node->children.back().get();
        }

        const double result = rollout(node, maxDepth);
        while (node) {
            ++node->visits;
            node->wins += result;
            node = node->parent;
        }
    } while (std::chrono::steady_clock::now() < deadline || root->visits == 0);

    if (root->children.empty()) return root->untriedMoves.front();
    const auto best = std::max_element(
        root->children.begin(), root->children.end(),
        [](const auto& left, const auto& right) {
            return left->visits < right->visits;
        });
    return (*best)->move;
}
