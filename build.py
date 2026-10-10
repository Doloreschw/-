"""把 src/ 里的 HTML、CSS、JS 合并成仓库根目录的单文件 index.html。

单文件版本可以直接用浏览器打开、部署到 GitHub Pages，
也可以整体粘贴进只支持纯前端的平台（如 REDcowork）。

用法：python3 build.py
"""
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
DIST = ROOT


def main() -> None:
    html = (SRC / "index.html").read_text(encoding="utf-8")
    css = (SRC / "styles.css").read_text(encoding="utf-8")
    data = (SRC / "data.js").read_text(encoding="utf-8")
    app = (SRC / "app.js").read_text(encoding="utf-8")

    html = html.replace('<link rel="stylesheet" href="styles.css">', f"<style>\n{css}</style>")
    html = html.replace('<script src="data.js"></script>', f"<script>\n{data}</script>")
    html = html.replace('<script src="app.js"></script>', f"<script>\n{app}</script>")

    DIST.mkdir(exist_ok=True)
    out = DIST / "index.html"
    out.write_text(html, encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
