# xl-wasm — xl-engine 的 WebAssembly 构建工程

把经典连珠引擎 **XL**（accreator/xl-engine）编译为 WebAssembly，供浏览器端五子棋使用。

## 上游信息

| 项 | 值 |
|---|---|
| 上游仓库 | https://github.com/accreator/xl-engine |
| 引擎 | XL（别名 Niren / 逆忍），最初由陈成涛设计，2015-2016 由陈成涛、孙锴、郝天翼改造支持 Gomocup 协议 |
| 许可证 | **GPL-2.0**（见 LICENSE） |
| 特性 | 竞技级连珠（Renju）引擎；**仅支持禁手规则**；VCF 搜索 + Alpha-Beta 迭代加深 |

## 本工程做了什么（相对于上游的修改）

**原则：上游源码 100% 原样，一切适配都在本工程新增文件中完成。**

1. `shim/xl_wasm_shim.cpp`（新增）
   - 替代上游 `pisqpipe.cpp`（Windows 管道协议层，依赖 `<windows.h>` 与 Win32 线程事件）
   - 重建：协议全局变量 + `pipeOut()` 输出捕获 + `do_mymove()/suggest()` 回调
   - 提供同步版 `turn()` 语义（`xl_engine_turn` 阻塞执行搜索）
   - 修正时钟语义：xl_ai.cpp 假定 `clock()` 为毫秒（原 MSVC 行为），
     编译时以 `-Dclock=xl_clock` 将调用重定向到 wall-clock 毫秒实现
2. `shim/fake-include/windows.h`（新增）
   - 空 stub。上游 `xl.cpp` 第 446 行 `#include <windows.h>` 为历史遗留，
     经核查未使用任何 Windows API；用 `-I shim/fake-include` 使源码原样编译
3. `build.sh`（新增）—— 分步编译脚本（`xl_ai.cpp` 单独加 `-Dclock=xl_clock`）

## 构建

前置：安装并激活 [emsdk](https://github.com/emscripten-core/emsdk)（Emscripten）。

```bash
bash build.sh
# 产物: dist/xl-engine.js + dist/xl-engine.wasm
```

## 导出接口（JS / Worker 调用）

| 函数 | 说明 |
|---|---|
| `xl_engine_init(w, h)` | 初始化棋盘（本引擎固定 15×15） |
| `xl_engine_restart()` | 重开一局 |
| `xl_engine_my(x, y)` | 通知引擎"自己的"落子（按真实顺序） |
| `xl_engine_opp(x, y)` | 通知引擎"对手的"落子（按真实顺序） |
| `xl_engine_turn(timeout_ms)` | 思考一步，**同步阻塞**；返回 `(x<<8)\|y`，失败 -1 |
| `xl_engine_takeback(x, y)` | 悔棋（上游有顺序限制 FIXME，网页端建议 restart+重放） |
| `xl_engine_end()` | 释放 |
| `xl_engine_info()` / `xl_engine_out()` / `xl_engine_clear_out()` | 引擎信息 / 输出日志缓冲 |

坐标：x = 列（0-14 左→右），y = 行（0-14 上→下）。**落子必须按真实对局顺序通知**。

## 引擎行为要点

- **首手特判**：空盘调用 `turn()` 直接返回中心 (7,7)。
- **颜色语义**：引擎不预设执黑/执白——它把"当前该落子的一方"视为自己
  （由内部手数奇偶 `SIDE(num) = ~num & 1` 决定：第 1、3、5…手为黑）。
- **禁手**：仅对先手方（黑）实施 长连/四四/三三 禁手检查（`XlCheckLastMove`）。
- **悔棋**：上游实现存在顺序限制，本工程建议以 `restart` + 全量重放实现悔棋。
- **性能**：单线程；每次搜索前重建局面（内部实现如此，开销可忽略）。

## 测试

```bash
node test/quick_test.cjs
# 验证：加载 / 首手中心 / 时钟语义（turn(4000) 应 ≈4s） / 连续落子合法性
```

## 参考

- 上游 README（含引擎历史与文档链接）：`README-upstream.md`
- 原始设计文档：http://www.aiexp.info/files/introduction_to_xl.pdf
