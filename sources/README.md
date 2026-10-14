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

1. **`src-xl/xl_ai.cpp`** —— 静态哈希表尺寸与搜索上限调整（唯一源码级修改，两个版本）：
   - **v46（2026-10-13）首次下调**：`HASHTT_SIZE`: `_16M` → `_2M`、`VC4TT_SIZE`: `_4M` → `_1M`（原静态内存 ≈ 203MB，WebAssembly 网页场景不可承受，合计下调至 32MB）
   - **v49（2026-10-14）回调扩充**：`HASHTT_SIZE`: `_2M` → `_4M`、`VC4TT_SIZE`: `_1M` → `_2M`（合计 64MB 静态数据，`INITIAL_MEMORY` 提至 128MB）；`MAX_VC4_NODE` / `NOR_VC4_NODE`: `10000` → `50000`（增强算杀/防杀搜索）
   - 详见源码头部 `[wasm patch by startian]` 注释；v49 对照实测（vs「困难」Rapfi 经典）撑持手数约提升一倍（30 → 52~62 手量级）
2. **`shim/xl_wasm_shim.cpp`（新增，未改动上游任何逻辑）** —— 替代上游
   `pisqpipe.cpp`（Windows 管道协议层）的 WebAssembly 嵌入层：
   - 重建协议全局变量、`pipeOut()` 输出捕获、`do_mymove()/suggest()` 回调
   - 提供同步版 `turn()` 语义，导出 `xl_engine_*` C 接口供 JS/Worker 调用
   - 时钟重定向：`xl_ai.cpp` 假定 `clock()` 为毫秒（原 MSVC 行为），
     编译时以 `-Dclock=xl_clock` 将调用重定向到 wall-clock 毫秒实现
3. **`shim/fake-include/windows.h`（新增）** —— 空 stub。上游 `xl.cpp`
   第 446 行的 `#include <windows.h>` 为历史遗留（未使用任何 Windows API），
   以此保持上游源码原样编译。
4. **`build.sh`（新增）** —— Emscripten 构建脚本（分步编译 + 链接；v49 起 `INITIAL_MEMORY=128MB` 配合哈希尺寸）。

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

### v2 增强补丁（2026-10-14）

在提取版基础上的**新增修改**（GPL-3.0 允许；修改记录照录于此，脚本来也照录）：

1. 注入 `wouldMakeOpenFour` / `findOpenFourBlock`：全形态模拟检测"对手落子即形成活四"的点并优先封锁（连三/跳三通用）
2. 决策链新增步骤 2.5（活四威胁封锁，置于"自造双杀"之前——先保命再进攻）
3. `willCreateDoubleThreat` 判定收紧：真活三（两端开放）计 2 分、眠三计 1 分，双杀阈值 `>=2` → `>=3`（消除"双眠三误报双杀"）
4. 决策链步骤 4 选点优化：选"威胁值最大"的封锁点而非坐标序第一个
5. 实测效果：修复"对手活三不设防"的速败模式（单元对照探针：旧版脱先 → 新版正确封锁；对战中败因由低级失明升级为对手双杀级组合）
6. 复现：`python prepare_kevin.py && python patch_binghen_guard.py`（后者对前者的产物做 5 处文本替换）

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
