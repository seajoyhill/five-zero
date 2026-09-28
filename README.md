# 五子棋与井字棋

完整的网页版棋类小游戏：包含五子棋与井字棋，支持双人对战 / 人机对战。五子棋内置本地蒙特卡洛树搜索（MCTS）AI，可调节思考时长；同时支持 C++ 远程 MCTS 服务。井字棋内置 Minimax 不败 AI。

## 快速开始

### 纯前端（本地 MCTS AI）

直接用浏览器打开 `index.html`，再通过顶部标签切换五子棋或井字棋。

```sh
open index.html
```

### 前后端分离（C++ AI 服务）

```sh
# 1. 编译并启动 C++ AI 服务
cd cpp
make setup   # 下载 header-only 依赖（只需一次）
make         # 编译
./build/gomoku_server

# 2. 浏览器打开 index.html，点击「切换 AI」选择「远程 C++ MCTS」
open ../index.html
```

## 项目结构

```
five-zero/
├── index.html               # 主页面
├── css/
│   └── style.css            # 样式
├── js/
│   ├── board.js             # 棋盘数据模型 + 胜负判定（纯逻辑）
│   ├── ai.js                # AI 接口、随机 AI、浏览器端 MCTS
│   ├── remote_ai.js         # 远程 MCTS（HTTP → C++）
│   ├── game.js              # 游戏控制器（回合管理、AI 调度、降级）
│   ├── main.js              # 五子棋 Canvas 渲染 + 鼠标交互
│   └── tic_tac_toe.js       # 井字棋逻辑、Minimax AI + UI
├── cpp/
│   ├── gomoku_ai.h          # C++ 五子棋 AI 抽象基类
│   ├── random_ai.h / .cpp   # 随机 AI 示例实现
│   ├── mcts_ai.h / .cpp     # C++ 蒙特卡洛树搜索 AI
│   ├── server.cpp           # HTTP 服务（cpp-httplib + nlohmann/json）
│   └── Makefile             # 构建脚本
└── README.md
```

## 架构

```
浏览器 (index.html)                    C++ HTTP Server (:8080)
┌────────────────────┐     POST        ┌──────────────────────┐
│ AIPlayerFactory    │── /api/move ──►│ GomokuAI (抽象接口)  │
│  ├─ MCTSAIPlayer   │   (JSON)       │  ├─ MCTSAI (实现)     │
│  ├─ RandomAIPlayer │◄── {row,col} ──│  └─ RandomAI (实现)   │
│  └─ RemoteAIPlayer │                 └──────────────────────┘
└────────────────────┘
         │ 远程不可用时自动降级到本地 RandomAIPlayer
         ▼
   无感知继续游戏
```

## API 协议

**POST /api/move**

```json
// Request
{
  "board": [[0,0,1,...], ...],
  "size": 15,
  "player": 2,
  "lastMove": { "row": 7, "col": 7 },
  "aiType": "mcts",
  "aiStrength": "strong",
  "thinkTimeMs": 1800
}

// Response 200
{ "row": 8, "col": 7 }

// Response 400 / 500
{ "error": "..." }
```

**GET /api/health**

```json
{ "status": "ok" }
```

## MCTS AI 与思考强度

五子棋人机模式默认使用本地 MCTS。控制区的「强度」会影响每一步的搜索时间：

| 档位 | 目标搜索时长 | 适用场景 |
| --- | ---: | --- |
| 入门 | 约 0.25 秒 | 快速试玩、移动设备 |
| 标准 | 约 0.8 秒 | 默认设置 |
| 强力 | 约 1.8 秒 | 更重视棋力 |
| 大师 | 约 4 秒 | 允许更长思考时间 |

点击「切换 AI」可以在「本地 MCTS → 本地随机 → 远程 C++ MCTS」之间切换。远程模式需要先启动 C++ 服务；服务不可用时会自动降级为本地随机 AI。

MCTS 会优先处理立即获胜和必须防守的着法，并将搜索候选限制在已有棋子附近，以适配浏览器端的 15×15 棋盘。

## 如何用 C++ 编写自己的 AI

### 1. 实现 `GomokuAI` 接口

```cpp
// my_ai.h
#include "gomoku_ai.h"

class MyAI : public GomokuAI {
public:
    GomokuMove getMove(const int* board, int size, int player) override {
        // board[row * size + col]: 0=空, 1=黑, 2=白
        // 在这里实现你的算法
        return {7, 7};
    }
};
```

### 2. 注册并编译

在 `server.cpp` 的 `createAI()` 中注册：

```cpp
if (type == "myai") {
    return std::make_unique<MyAI>();
}
```

`make` 后重启服务即可。

### 3. 前端调用

在 `index.html` 中设置 `RemoteAIPlayer.serverUrl`，或通过 UI 切换即可。

## 玩法

### 五子棋

- **黑方先行**，点击棋盘交叉点落子
- 横、竖、对角任意方向**五子连珠**即获胜
- 点击「切换模式」在双人对战 / 人机对战间切换
- 点击「切换 AI」在本地 MCTS / 本地随机 / 远程 C++ MCTS 间切换
- 通过「强度」选择 AI 思考时间，强度越高允许的搜索时间越长
- 鼠标悬停显示落子预览

### 井字棋

- **X 先行**，点击 3×3 棋盘格落子
- 横、竖、对角线任意方向连成三个相同标记即获胜
- 点击「切换模式」在双人对战 / 人机对战间切换
- 人机模式中 AI 使用 Minimax，能够阻止必败局面并在最优策略下保持不败
- 获胜连线会高亮显示

## 模块依赖

```
board.js  ← 纯数据层，无依赖
ai.js     ← 无依赖
remote_ai.js ← ai.js
game.js   ← board.js + ai.js
main.js   ← board.js + game.js + ai.js
tic_tac_toe.js ← 独立的井字棋逻辑与 UI
```
