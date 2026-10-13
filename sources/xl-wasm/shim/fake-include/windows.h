/*
 * 空 stub —— 仅用于 xl.cpp 中的 #include <windows.h>
 * xl.cpp 实际上未使用任何 Windows API（已逐行核查），
 * 该 include 为历史上游遗留。通过 -I shim/fake-include 使
 * 上游源码保持 100% 原样即可编译到 WebAssembly。
 */
#ifndef XL_FAKE_WINDOWS_H
#define XL_FAKE_WINDOWS_H
#endif
