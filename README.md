# 五子棋 (Gomoku)

完整的网页版五子棋：Canvas 棋盘渲染 + 双人对战 / 人机对战 + 可扩展 AI 接口 + C++ 远程 AI 服务。

## 快速开始

### 纯前端（本地随机 AI）

直接用浏览器打开 `index.html` 即可开始游戏。

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

# 2. 浏览器打开 index.html，点击「切换 AI」选择「远程 C++」
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
│   ├── ai.js                # AI 棋手接口 + 随机 Mock 实现
│   ├── remote_ai.js         # 远程 AI（HTTP → C++）
│   ├── game.js              # 游戏控制器（回合管理、AI 调度、降级）
│   └── main.js              # Canvas 渲染 + 鼠标交互
├── cpp/
│   ├── gomoku_ai.h          # C++ 五子棋 AI 抽象基类
│   ├── random_ai.h / .cpp   # 随机 AI 示例实现
│   ├── server.cpp           # HTTP 服务（cpp-httplib + nlohmann/json）
│   └── Makefile             # 构建脚本
└── README.md
```

## 架构

```
浏览器 (index.html)                    C++ HTTP Server (:8080)
┌────────────────────┐     POST        ┌──────────────────────┐
│ AIPlayerFactory    │── /api/move ──►│ GomokuAI (抽象接口)  │
│  ├─ RandomAIPlayer │   (JSON)       │  └─ RandomAI (实现)  │
│  └─ RemoteAIPlayer │◄── {row,col} ──│                      │
└────────────────────┘                 └──────────────────────┘
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
  "lastMove": { "row": 7, "col": 7 }
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

- **黑方先行**，点击棋盘交叉点落子
- 横、竖、对角任意方向**五子连珠**即获胜
- 点击「切换模式」在双人对战 / 人机对战间切换
- 点击「切换 AI」在本地随机 / 远程 C++ 间切换
- 鼠标悬停显示落子预览

## 模块依赖

```
board.js  ← 纯数据层，无依赖
ai.js     ← 无依赖
remote_ai.js ← ai.js
game.js   ← board.js + ai.js
main.js   ← board.js + game.js + ai.js
```
