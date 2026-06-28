/**
 * random_ai.h — 随机落子 AI（示例实现）
 */

#pragma once

#include "gomoku_ai.h"
#include <vector>
#include <random>

class RandomAI : public GomokuAI {
public:
    RandomAI();

    GomokuMove getMove(const int* board, int size, int player) override;

private:
    std::mt19937 rng_;
};
