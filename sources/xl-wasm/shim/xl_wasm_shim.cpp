/*
 * xl_wasm_shim.cpp — xl-engine 的 WebAssembly 嵌入层
 * ===================================================
 * 本文件替代上游 pisqpipe.cpp（Windows 管道协议层），
 * 使 xl-engine（accreator/xl-engine, GPL-2.0）可直接编译为
 * WebAssembly 模块，供 JavaScript / Web Worker 调用。
 *
 * 设计原则：
 *   - 不改动 xl.cpp / xl_ai.cpp 任何一行（上游源码 100% 原样）
 *   - 仅重建"协议 IO 层"：pipeOut / do_mymove / suggest + 全局协议变量
 *   - 通过 -Dclock=xl_clock（仅作用于 xl_ai.cpp）修正 Emscripten
 *     时钟语义差异：xl_ai.cpp 以“毫秒”语义使用 clock()（原 MSVC 行为），
 *     而 Emscripten 的 clock() 单位与语义不同；重定向到 wall-clock 毫秒。
 *
 * 线程模型：
 *   上游使用 Windows 线程事件异步思考（HANDLE/SetEvent）；
 *   本 shim 采用同步模型 —— 在 Web Worker 中调用 xl_engine_turn()
 *   阻塞执行搜索，算完返回坐标（主线程不受阻）。
 *
 * License: GPL-2.0（与上游 xl-engine 一致）
 */

#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "pisqpipe.h"
/* 注意：不要 include xl_def.h —— 其中 `#define bool char` 会破坏
 * emscripten.h 的 C++ 模板（__em_asm_sig<char> 重复定义）。
 * 本文件所需的全部声明都在 pisqpipe.h 中。 */

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define XL_API EMSCRIPTEN_KEEPALIVE
#else
#define XL_API
#endif

/* ============ 协议全局变量（原 pisqpipe.cpp 定义） ============ */

int width = 15, height = 15;            /* board size */
int info_timeout_turn = 30000;          /* time for one turn in ms */
int info_timeout_match = 1000000000;    /* total time for a game */
int info_time_left = 1000000000;        /* left time for a game */
int info_max_memory = 0;
int info_game_type = 1;
int info_exact5 = 0;
int info_continuous = 0;
int terminate = 0;
unsigned start_time = 0;
char dataFolder[256] = {0};
int time_start = 0;
int time_move = 0;

/* ============ 输出捕获（原 pipeOut 写 stdout） ============ */

static char g_out[65536];
static int  g_out_len = 0;

int pipeOut(char *fmt, ...)
{
    char tmp[2048];
    va_list va;
    int n;
    va_start(va, fmt);
    n = vsnprintf(tmp, sizeof(tmp), fmt, va);
    va_end(va);
    if (n < 0) return 0;
    if (g_out_len + n + 2 <= (int)sizeof(g_out) - 1)
    {
        memcpy(g_out + g_out_len, tmp, n);
        g_out_len += n;
        g_out[g_out_len++] = '\n';
        g_out[g_out_len] = '\0';
    }
    return n;
}

/* ============ 我方落子回调 ============ */

static int g_my_x = -1, g_my_y = -1;

void do_mymove(int x, int y)
{
    g_my_x = x;
    g_my_y = y;
    /* brain_my 内部会再 MoveAt 一次 —— MoveAt 幂等（_map 检查），安全 */
    brain_my(x, y);
}

void suggest(int x, int y)
{
    pipeOut("SUGGEST %d,%d", x, y);
}

/* ============ 时钟：wall-clock 毫秒 ============ */
/* xl_ai.cpp 编译时带 -Dclock=xl_clock，将全部 clock() 调用重定向到此处。
 * Emscripten 的 emscripten_get_now() 返回自页面加载以来的毫秒数（double）。 */

#ifdef __EMSCRIPTEN__
extern "C" clock_t xl_clock(void) { return (clock_t)emscripten_get_now(); }
#else
extern "C" clock_t xl_clock(void) { return (clock_t)((double)clock() * 1000.0 / CLOCKS_PER_SEC); }
#endif

/* ============ 导出接口（供 JS / Worker 调用） ============ */

extern "C" {

/* 初始化棋盘（对应 Gomocup INIT + START） */
XL_API void xl_engine_init(int w, int h)
{
    width = w;
    height = h;
    brain_init();
}

/* 重开一局 */
XL_API void xl_engine_restart(void)
{
    brain_restart();
}

/* 通知：引擎自己的落子（按真实落子顺序调用） */
XL_API void xl_engine_my(int x, int y)
{
    brain_my(x, y);
}

/* 通知：对手的落子（按真实落子顺序调用） */
XL_API void xl_engine_opp(int x, int y)
{
    brain_opponents(x, y);
}

/* 思考一回合，同步阻塞；返回坐标打包 (x<<8)|y，失败返回 -1
 * timeout_ms: 本回合思考时限（毫秒） */
XL_API int xl_engine_turn(int timeout_ms)
{
    if (timeout_ms > 0) info_timeout_turn = timeout_ms;
    time_start = (int)xl_clock();
    time_move  = info_timeout_turn - 100;
    if (time_move < 100) time_move = 100;
    terminate = 0;
    g_my_x = -1;
    g_my_y = -1;
    brain_turn();
    if (g_my_x < 0 || g_my_x >= width || g_my_y < 0 || g_my_y >= height)
        return -1;
    return (g_my_x << 8) | (g_my_y & 0xFF);
}

/* 悔棋（上游实现有顺序限制的 FIXME；网页端建议用 restart+重放替代） */
XL_API int xl_engine_takeback(int x, int y)
{
    return brain_takeback(x, y);
}

XL_API void xl_engine_end(void)
{
    brain_end();
}

XL_API const char *xl_engine_info(void)
{
    return infotext;
}

XL_API const char *xl_engine_out(void)
{
    return g_out;
}

XL_API void xl_engine_clear_out(void)
{
    g_out_len = 0;
    g_out[0] = '\0';
}

} /* extern "C" */
