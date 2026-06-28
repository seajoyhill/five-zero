/**
 * random_ai.cpp — 随机落子 AI 实现
 *
 * 收集所有空位，均匀随机选择一个。仅供测试。
 */

#include "random_ai.h"
#include <chrono>

RandomAI::RandomAI()
    : rng_(static_cast<unsigned>(
          std::chrono::steady_clock::now().time_since_epoch().count()))
{}

GomokuMove RandomAI::getMove(const int* board, int size, int /*player*/) {
    std::vector<GomokuMove> emptyCells;
    emptyCells.reserve(size * size);

    for (int r = 0; r < size; ++r) {
        for (int c = 0; c < size; ++c) {
            if (board[r * size + c] == 0) {
                emptyCells.push_back({r, c});
            }
        }
    }

    if (emptyCells.empty()) {
        return {-1, -1};
    }

    std::uniform_int_distribution<size_t> dist(0, emptyCells.size() - 1);
    return emptyCells[dist(rng_)];
}
