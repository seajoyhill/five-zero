/**
 * mcts_ai.h — 蒙特卡洛树搜索五子棋 AI
 *
 * 通过限定候选着法、战术优先和时间预算，在服务端持续进行 MCTS 模拟。
 */

#pragma once

#include "gomoku_ai.h"

#include <chrono>
#include <memory>
#include <random>
#include <vector>

class MCTSAI : public GomokuAI {
public:
    explicit MCTSAI(int thinkTimeMs = 800);

    GomokuMove getMove(const int* board, int size, int player) override;

private:
    struct Node {
        std::vector<int> board;
        int size = 0;
        int playerToMove = 0;
        int rootPlayer = 0;
        int winner = 0;
        GomokuMove move{-1, -1};
        Node* parent = nullptr;
        std::vector<std::unique_ptr<Node>> children;
        std::vector<GomokuMove> untriedMoves;
        int visits = 0;
        double wins = 0.0;

        bool isTerminal() const;
    };

    int thinkTimeMs_;
    std::mt19937 rng_;

    static int opponent(int player);
    static bool inside(int size, int row, int col);
    static int indexOf(int size, int row, int col);
    static int countEmpty(const std::vector<int>& board);
    static bool hasFive(const std::vector<int>& board, int size, int row, int col, int player);

    bool isWinningMove(std::vector<int>& board, int size, const GomokuMove& move, int player) const;
    std::vector<GomokuMove> candidateMoves(
        std::vector<int>& board, int size, int player, int maxCandidates) const;
    std::vector<GomokuMove> immediateMoves(
        std::vector<int>& board, int size, const std::vector<GomokuMove>& moves, int player) const;
    Node* selectChild(Node* node) const;
    double rollout(const Node* node, int maxDepth);
};
