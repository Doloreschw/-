"""生成压缩版单文件 dist/yiwu-qianjing.min.html（给有上传大小限制的平台用），
以及 dist/parts/：页面结构放进 shell.js，入口 index-min.html 只有一行，
给不接受 HTML 附件的平台（如 REDcowork）用——上传 JS/CSS，入口页直接粘贴。

只做安全的压缩：去注释和缩进、紧凑化 JSON、去掉页面没用到的字段，不改任何逻辑。
用法：python3 build_min.py
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"


def min_css(css: str) -> str:
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r"\s+", " ", css)
    css = re.sub(r"\s*([{};,>])\s*", r"\1", css)
    css = re.sub(r":\s+", ":", css)          # 属性冒号后空格
    css = css.replace(";}", "}")
    return css.strip()


def min_js(js: str) -> str:
    # 只删整行注释和块注释（代码里的字符串不含 /* 或以 // 开头的行），再去掉缩进和空行
    js = re.sub(r"/\*.*?\*/", "", js, flags=re.S)
    out = []
    for line in js.splitlines():
        s = line.strip()
        if not s or s.startswith("//"):
            continue
        out.append(s)
    return "\n".join(out)


def min_market(js: str) -> str:
    ns = {}
    for name in ["JD_NOTE", "MARKET", "PLATFORM", "SCENE_AGE"]:
        m = re.search(r"window\." + name + r" = (.*?);\n(?=window\.|$)", js, flags=re.S)
        ns[name] = json.loads(m.group(1))
    for v in ns["MARKET"].values():
        for s in v["skus"]:
            s.pop("shop", None)
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    return "\n".join(f"window.{k}={dump(v)};" for k, v in ns.items())


def main() -> None:
    html = (SRC / "index.html").read_text(encoding="utf-8")
    css = min_css((SRC / "styles.css").read_text(encoding="utf-8"))
    data = min_js((SRC / "data.js").read_text(encoding="utf-8"))
    market = min_market((SRC / "market.js").read_text(encoding="utf-8"))
    app = min_js((SRC / "app.js").read_text(encoding="utf-8"))
    html = re.sub(r"<!--.*?-->", "", html, flags=re.S)
    html = re.sub(r"\n\s+", "\n", html)
    html = html.replace('<link rel="stylesheet" href="styles.css">', f"<style>{css}</style>")
    html = html.replace('<script src="data.js"></script>', f"<script>{data}</script>")
    html = html.replace('<script src="market.js"></script>', f"<script>{market}</script>")
    html = html.replace('<script src="app.js"></script>', f"<script>{app}</script>")
    out = ROOT / "dist" / "yiwu-qianjing.min.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size / 1024:.1f} KB)")


def build_parts() -> None:
    parts = ROOT / "dist" / "parts"
    parts.mkdir(parents=True, exist_ok=True)
    html = (SRC / "index.html").read_text(encoding="utf-8")
    body = re.search(r'<body>(.*?)<script src="data.js">', html, re.S).group(1)
    body = re.sub(r"\n\s+", "\n", re.sub(r"<!--.*?-->", "", body, flags=re.S)).strip()
    font = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+SC:wght@400;500;700;900&display=swap"
    files = {
        "shell.js": "(function(){var l=document.createElement('link');l.rel='stylesheet';l.href='" + font +
                    "';document.head.appendChild(l);document.body.insertAdjacentHTML('afterbegin'," +
                    json.dumps(body, ensure_ascii=False) + ");})();\n",
        "styles.css": min_css((SRC / "styles.css").read_text(encoding="utf-8")),
        "data.js": min_js((SRC / "data.js").read_text(encoding="utf-8")),
        "market.js": min_market((SRC / "market.js").read_text(encoding="utf-8")),
        "app.js": min_js((SRC / "app.js").read_text(encoding="utf-8")),
        "index-min.html": '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
                          '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
                          '<title>一物千景</title><link rel="stylesheet" href="styles.css"></head><body>'
                          '<script src="shell.js"></script><script src="data.js"></script>'
                          '<script src="market.js"></script><script src="app.js"></script></body></html>',
    }
    for name, content in files.items():
        (parts / name).write_text(content, encoding="utf-8")
        if not name.endswith(".html"):
            (parts / (name + ".txt")).write_text(content, encoding="utf-8")
    print(f"wrote {parts}/ ({len(files)} files)")


if __name__ == "__main__":
    build_parts()
    main()
