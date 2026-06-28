/**
 * gomoku_ai.h — C++ 五子棋 AI 抽象基类
 *
 * 与 JS 侧 AIPlayer 设计一致：策略模式，用户继承 GomokuAI 并实现 getMove()。
 *
 * 棋盘编码：0 = 空, 1 = 黑方, 2 = 白方
 * 棋盘布局：一维数组，row-major，grid[row * size + col]
 */

#pragma once

#include <cstddef>

struct GomokuMove {
    int row;
    int col;
};

class GomokuAI {
public:
    virtual ~GomokuAI() = default;

    /**
     * 根据当前棋盘状态计算落子位置
     *
     * @param board  扁平化一维数组，长度为 size*size，row-major
     *               值：0=空, 1=黑方, 2=白方
     * @param size   棋盘大小（标准 15）
     * @param player 本方颜色（1=黑, 2=白）
     * @return       落子坐标。若无有效位置，返回 {-1, -1}
     */
    virtual GomokuMove getMove(const int* board, int size, int player) = 0;
};
