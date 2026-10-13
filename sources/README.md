# 开源引擎来源与许可（Sources & Licenses）

本目录包含 wuziqi.startian.top 站点所嵌入的开源五子棋引擎的**对应源码**、
**修改记录**与**构建脚本**，以满足 GPL 许可证的源码可获得性要求。

---

## 1. 墨渊（Mo Yuan）= XL Engine · WebAssembly

| 项 | 说明 |
|---|---|
| 上游 | [accreator/xl-engine](https://github.com/accreator/xl-engine) |
| 引擎 | XL（别名 Niren / 逆忍），最初由陈成涛设计；2015-2016 由陈成涛、孙锴、郝天翼改造支持 Gomocup 协议 |
| 许可证 | **GPL-2.0**（见 `xl-wasm/LICENSE`） |
| 网站中的形态 | `assets/xl-engine.wasm`（56KB）+ `assets/xl-engine.js` + `assets/xl-worker.js` |

### 对上游源码的修改（全部列出）

1. **`src-xl/xl_ai.cpp`** —— 下调静态哈希表尺寸（唯一源码级修改）：
   - `HASHTT_SIZE`: `_16M` → `_2M`（16M×8B=128MB → 16MB）
   - `VC4TT_SIZE`: `_4M` → `_1M`（2×4M×8B=64MB → 16MB）
   - 原因：原静态内存占用 ≈ 203MB，WebAssembly 网页场景不可承受；
     合计下调至 32MB。对网页限时（数秒/步）的棋力影响甚微。
2. **`shim/xl_wasm_shim.cpp`（新增，未改动上游任何逻辑）** —— 替代上游
   `pisqpipe.cpp`（Windows 管道协议层）的 WebAssembly 嵌入层：
   - 重建协议全局变量、`pipeOut()` 输出捕获、`do_mymove()/suggest()` 回调
   - 提供同步版 `turn()` 语义，导出 `xl_engine_*` C 接口供 JS/Worker 调用
   - 时钟重定向：`xl_ai.cpp` 假定 `clock()` 为毫秒（原 MSVC 行为），
     编译时以 `-Dclock=xl_clock` 将调用重定向到 wall-clock 毫秒实现
3. **`shim/fake-include/windows.h`（新增）** —— 空 stub。上游 `xl.cpp`
   第 446 行的 `#include <windows.h>` 为历史遗留（未使用任何 Windows API），
   以此保持上游源码原样编译。
4. **`build.sh`（新增）** —— Emscripten 构建脚本（分步编译 + 链接）。

> 除上述之外，`src-xl/` 中的上游源码与上游仓库一一对应（未修改文件原样收录）。

### 构建方法

```bash
# 前置：emsdk（Emscripten）已安装并激活
bash build.sh
# 产物：dist/xl-engine.js + dist/xl-engine.wasm
# 接口说明见工程 README（xl-wasm/README 样式），或源码 shim/xl_wasm_shim.cpp
```

---

## 2. 冰痕（Bing Hen）= gomoku-ai 提取版

| 项 | 说明 |
|---|---|
| 上游 | [kevin2014123/gomoku-ai](https://github.com/kevin2014123/gomoku-ai) |
| 许可证 | **GPL-3.0**（见 `binghen/LICENSE-GPL-3.0`） |
| 网站中的形态 | `assets/binghen-engine.js`（13.8KB，提取版）+ `assets/bh-worker.js` |

### 提取说明

- `prepare_kevin.py`：从上游 `script.js` 自动提取引擎核心
  （minimax + alpha-beta + 迭代加深 + 评估/棋型/候选生成 + 决策链），
  剥离 UI 依赖（以桩替代），生成自包含 IIFE `binghen-engine.js`。
- **算法逻辑未改动**；新增仅适配层（真实棋盘颜色 → 引擎内部语义、
  接口包装）。提取过程可完整复现：`python prepare_kevin.py`。
- `bh-worker.js`：Web Worker 宿主（思考为同步阻塞，放 worker 避免卡 UI）。

---

## 3. 既有开源组件（此前已内置）

- **Rapfi** © dhbloo —— https://github.com/dhbloo/rapfi —— GPL-3.0
  （网站内「困难」= 经典评估、「灵拙」= NNUE 神经网络）
  对应构建来自 [lowqen/RapfiWeb](https://github.com/lowqen/RapfiWeb)。

---

## 4. 许可与再分发声明

- 以上各组件的 WebAssembly / JavaScript 产物均以**未修改的上游许可证**
  （GPL-2.0 / GPL-3.0 / GPL-3.0）分发。
- 本目录已随附各许可证全文；修改记录见上文各节。
- 各引擎作为独立模块（独立 wasm / 独立 worker 脚本）通过公开接口调用。
