#!/usr/bin/env python3
"""把桌面「五子棋.html」（单文件版）转成网页优化版：
   - index.html：去掉内嵌 16.6MB 资源行，改为按需异步加载 assets/
   - assets/：cls.*（经典引擎）/ nnue.*（灵拙神经网络），浏览器可缓存
单文件版的便携性保留在桌面原件里；本脚本生成的是发布用「拆分版」。
用法：python build_web.py
"""
import os, re, base64

HERE = os.path.dirname(os.path.abspath(__file__))
MASTER = os.path.join(HERE, "..", "..", "五子棋.html")   # 桌面\五子棋.html
OUT_HTML = os.path.join(HERE, "index.html")
ASSETS = os.path.join(HERE, "assets")

with open(MASTER, "r", encoding="utf-8") as f:
    content = f.read()

lines = content.split("\n")
i = max(range(len(lines)), key=lambda k: len(lines[k]))
big = lines[i]
assert "__RAPFI_ASSETS=" in big, "master 里没找到资源行"
lines[i] = "/* 网页优化版：Rapfi 引擎资源已外置到 assets/（按需异步加载，见 RAPFI.ensureAssets）*/"
with open(OUT_HTML, "w", encoding="utf-8", newline="") as f:
    f.write("\n".join(lines))

os.makedirs(ASSETS, exist_ok=True)
for kind in ("cls", "nnue"):
    m = re.search(kind + r":\{([^{}]*)\}", big)
    for key, b64 in re.findall(r'(\w+):"([A-Za-z0-9+/=]*)"', m.group(1)):
        with open(os.path.join(ASSETS, kind + "." + key), "wb") as f:
            f.write(base64.b64decode(b64))

print("index.html:", os.path.getsize(OUT_HTML), "字节")
print("assets:", sorted(os.listdir(ASSETS)))
