#!/bin/bash
# ============================================================
# xl-engine → WebAssembly 构建脚本
# 用法（在 Git Bash 中）: bash build.sh
# 前置：emsdk 已安装并 activate（默认路径见 EMSDK_DIR，可覆盖）
# ============================================================
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

# ---- emsdk 定位 ----
if [ -z "$EMCC" ]; then
  # 优先 emsdk 默认安装位置；也可通过环境变量 EMCC 覆盖
  CANDIDATES=(
    "/c/Users/86186/toolchains/emsdk-install/emsdk-main/upstream/emscripten/emcc"
    "$HOME/toolchains/emsdk-install/emsdk-main/upstream/emscripten/emcc"
  )
  for c in "${CANDIDATES[@]}"; do
    if [ -f "$c" ]; then EMCC="$c"; break; fi
  done
fi
if [ -z "$EMCC" ] || [ ! -f "$EMCC" ]; then
  echo "[!] 找不到 emcc，请先安装/激活 emsdk，或设置 EMCC 环境变量" >&2
  exit 1
fi
echo "[*] 使用 emcc: $EMCC"

mkdir -p build dist

COMMON_FLAGS="-O3 -fsigned-char -Wall -Wno-unused -Wno-format -Wno-write-strings"

echo "[1/4] 编译 xl.cpp（上游，原样）..."
"$EMCC" $COMMON_FLAGS \
  -I src -I shim/fake-include \
  -c src/xl.cpp -o build/xl.o

echo "[2/4] 编译 xl_ai.cpp（上游，原样 + 时钟重定向 -Dclock=xl_clock）..."
"$EMCC" $COMMON_FLAGS \
  -Dclock=xl_clock \
  -I src -I shim/fake-include \
  -c src/xl_ai.cpp -o build/xl_ai.o

echo "[3/4] 编译 xl_wasm_shim.cpp（本工程嵌入层）..."
"$EMCC" $COMMON_FLAGS \
  -I src \
  -c shim/xl_wasm_shim.cpp -o build/shim.o

echo "[4/4] 链接 → dist/xl-engine.js + dist/xl-engine.wasm ..."
"$EMCC" build/xl.o build/xl_ai.o build/shim.o \
  -O3 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=134217728 \
  -s STACK_SIZE=2097152 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME=createXlEngine \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
  -s ENVIRONMENT=web,worker,node \
  -s FILESYSTEM=0 \
  --no-entry \
  -o dist/xl-engine.js

echo ""
echo "[✓] 构建完成："
ls -la dist/
