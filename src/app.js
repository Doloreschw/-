/* 一物千景 · 交互逻辑（纯前端，无后端依赖） */
(function () {
  "use strict";

  var CIRCLES = window.CIRCLES;
  var PRODUCTS = window.PRODUCTS;
  var LIB = window.SCENE_LIBRARY;
  var MAX_PICK = 6;
  var DAYS = ["周一", "周二", "周三", "周四", "周五", "周六"];

  var state = {
    product: null,     // { name, tagline, price, code, custom, scenes }
    filters: {},       // circle -> bool
    picked: [],        // scene ids, in order
    current: -1,       // index in visibleScenes for drawer
    mode: "chart"
  };

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  /* ───────── 指标 ───────── */
  function isOpp(s) { return s.x >= 55 && s.y <= 45; }
  function oppScore(s) { return Math.round(s.x * 0.6 + (100 - s.y) * 0.4); }
  function magnitude(s) { return 4 - s.size; } // 1等星最亮 = 人群最大
  function catalog(s, i) { return "YQ·" + state.product.code + "·" + String(i + 1).padStart(2, "0"); }
  function crowdVerdict(y) {
    if (y >= 65) return "红海：这个角度已经被写了很多";
    if (y >= 45) return "中等：有人写过，仍有差异化空间";
    return "蓝海：几乎没有商家在写";
  }
  function advice(s) {
    if (isOpp(s)) return { tag: "机会区", text: "优先发布。用真实素人口吻，首发后可小额加热测试。", opp: true };
    if (s.y >= 65) return { tag: "红海", text: "不建议首发。只有找到明显的差异角度时再写。", opp: false };
    if (s.x < 45) return { tag: "小众", text: "需求偏小，适合配合节日或话题节点发布。", opp: false };
    return { tag: "稳健", text: "可作为常规内容补充，保持账号的场景多样性。", opp: false };
  }

  /* ───────── 可复现的随机数（同名商品结果一致） ───────── */
  function seeded(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () {
      h += 0x6D2B79F5;
      var t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ───────── 自定义商品：场景库组合生成 ───────── */
  function generate(name, point, price) {
    var rnd = seeded(name + "|" + price);
    var pool = LIB.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    var sell = point || "刚好合用";
    var giftBoost = (price === "300-800元" || price === "800元以上") ? 12 : 0;
    var scenes = pool.slice(0, 12).map(function (p, k) {
      var x = Math.round(30 + rnd() * 62 + (p.circle === "gift" ? giftBoost : 0));
      x = Math.min(x, 94);
      var y = Math.round(10 + rnd() * 80);
      var size = 1 + Math.floor(rnd() * 3);
      var layouts = ["center", "left", "top-left"];
      return {
        id: "c" + k, title: p.who, circle: p.circle, x: x, y: y, size: size, custom: true,
        moment: p.when + "，" + p.who + "最在意的是" + p.pain + "。如果手边刚好有一个" + name + "，" + sell + "。",
        pains: [p.pain, "不确定" + name + "是否适合自己的情况"],
        searches: [p.search, p.search.split(" ")[0] + " " + name, name + " 推荐", name + " 真实体验"],
        hooks: [sell, "正好回应“" + p.pain + "”这件事"],
        worn: y >= 55 ? [name + "测评大合集", "开箱加参数对比的固定套路"] : ["这个场景下还很少有" + name + "的内容"],
        titles: [p.when + "，我带上了" + name, p.who + "的" + name + "清单", "给" + p.pain.replace(/^[很太]/, "") + "的人：试试" + name],
        cover: {
          layout: layouts[Math.floor(rnd() * 3)], text: rnd() > 0.5 ? "top" : "bottom",
          subject: p.who + "与" + name + "同框",
          note: "先让人看出是“" + p.when.replace(/的时候$/, "") + "”，商品只占画面一角"
        }
      };
    });
    return { name: name, tagline: point || "自定义商品", price: price, code: "NEW", custom: true, scenes: scenes };
  }

  function loadSample(id) {
    var p = PRODUCTS.filter(function (q) { return q.id === id; })[0];
    return { name: p.name, tagline: p.tagline, price: p.price, code: p.id.toUpperCase(), custom: false, scenes: p.scenes };
  }

  /* ───────── 视图切换 ───────── */
  function go(view) {
    ["home", "map", "plan"].forEach(function (v) {
      $("view-" + v).hidden = v !== view;
      var b = $("step-" + v);
      if (v === view) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    $("step-map").disabled = !state.product;
    $("step-plan").disabled = state.picked.length === 0;
    $("tray").hidden = view !== "map";
    closeDrawer();
    if (view === "plan") renderPlan();
    window.scrollTo(0, 0);
  }

  function start(product) {
    var loading = $("loading");
    var lines = loading.querySelectorAll(".line");
    lines.forEach(function (l) { l.classList.remove("on"); });
    loading.hidden = false;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var step = reduce ? 150 : 600;
    lines.forEach(function (l, i) { setTimeout(function () { l.classList.add("on"); }, step * i + 100); });
    setTimeout(function () {
      state.product = product;
      state.picked = [];
      state.filters = {};
      Object.keys(CIRCLES).forEach(function (c) { state.filters[c] = true; });
      loading.hidden = true;
      renderMap();
      go("map");
    }, step * 3 + 300);
  }

  /* ───────── 首页 ───────── */
  function miniConstellation(scenes) {
    var w = 280, h = 150, pad = 14;
    var svg = '<svg viewBox="0 0 ' + w + " " + h + '" aria-hidden="true">';
    var ox = pad + 0.55 * (w - 2 * pad), oy = pad + (1 - 0.45) * (h - 2 * pad);
    svg += '<rect x="' + ox + '" y="' + oy + '" width="' + (w - pad - ox) + '" height="' + (h - pad - oy) + '" fill="rgba(255,36,66,0.12)"/>';
    Object.keys(CIRCLES).forEach(function (c) {
      var pts = scenes.filter(function (s) { return s.circle === c; }).sort(function (a, b) { return a.x - b.x; });
      if (pts.length > 1) {
        svg += '<polyline fill="none" stroke="' + CIRCLES[c].color + '" stroke-opacity=".4" points="' +
          pts.map(function (s) { return (pad + s.x / 100 * (w - 2 * pad)) + "," + (pad + (1 - s.y / 100) * (h - 2 * pad)); }).join(" ") + '"/>';
      }
    });
    scenes.forEach(function (s) {
      var cx = pad + s.x / 100 * (w - 2 * pad), cy = pad + (1 - s.y / 100) * (h - 2 * pad);
      svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (1.5 + s.size * 1.3) + '" fill="' + CIRCLES[s.circle].color + '"/>';
    });
    return svg + "</svg>";
  }

  function renderSamples() {
    $("samples").innerHTML = PRODUCTS.map(function (p) {
      var opp = p.scenes.filter(isOpp).length;
      return '<button type="button" class="sample" data-id="' + p.id + '">' + miniConstellation(p.scenes) +
        '<div class="meta"><span class="name">' + esc(p.name) + '</span><span class="tag">' + esc(p.tagline) + "</span>" +
        '<span class="stat">12 个场景 · 机会区 <b>' + opp + "</b> 个 · " + esc(p.price) + "</span></div></button>";
    }).join("");
    $("samples").querySelectorAll(".sample").forEach(function (b) {
      b.addEventListener("click", function () { start(loadSample(b.getAttribute("data-id"))); });
    });
  }

  $("product-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("f-name").value.trim();
    if (!name) { $("f-error").hidden = false; $("f-name").focus(); return; }
    $("f-error").hidden = true;
    var match = PRODUCTS.filter(function (p) { return p.name === name; })[0];
    start(match ? loadSample(match.id) : generate(name, $("f-point").value.trim(), $("f-price").value));
  });

  /* ───────── 星图 ───────── */
  var W = 1000, H = 620, L = 64, R = 24, T = 24, B = 56;
  function px(x) { return L + x / 100 * (W - L - R); }
  function py(y) { return T + (1 - y / 100) * (H - T - B); }

  function visibleScenes() {
    return state.product.scenes.filter(function (s) { return state.filters[s.circle]; });
  }

  function renderMap() {
    var p = state.product;
    $("map-eyebrow").textContent = "场景星图 · " + p.price;
    $("map-title").textContent = p.name;
    $("map-tagline").textContent = p.tagline;
    $("custom-notice").hidden = !p.custom;
    var opp = p.scenes.filter(isOpp).length;
    var avg = Math.round(p.scenes.reduce(function (a, s) { return a + s.y; }, 0) / p.scenes.length);
    $("readout").innerHTML =
      '<div><span class="v">' + p.scenes.length + '</span><span class="l">场景</span></div>' +
      '<div><span class="v rose">' + opp + '</span><span class="l">机会区</span></div>' +
      '<div><span class="v">' + avg + '</span><span class="l">平均拥挤度</span></div>';
    renderChips();
    renderChart();
    renderList();
    renderTray();
  }

  function renderChips() {
    var used = {};
    state.product.scenes.forEach(function (s) { used[s.circle] = true; });
    $("circle-chips").innerHTML = Object.keys(CIRCLES).filter(function (c) { return used[c]; }).map(function (c) {
      return '<button type="button" class="chip" data-c="' + c + '" aria-pressed="' + state.filters[c] + '"><i style="background:' +
        CIRCLES[c].color + '"></i>' + CIRCLES[c].name + "</button>";
    }).join("");
    $("circle-chips").querySelectorAll(".chip").forEach(function (b) {
      b.addEventListener("click", function () {
        var c = b.getAttribute("data-c");
        var on = Object.keys(state.filters).filter(function (k) { return state.filters[k]; });
        if (on.length === 1 && state.filters[c]) return; // 至少保留一个
        state.filters[c] = !state.filters[c];
        b.setAttribute("aria-pressed", state.filters[c]);
        renderChart(); renderList();
      });
    });
  }

  function starfield() {
    var rnd = seeded("sky" + state.product.name), out = "";
    for (var i = 0; i < 140; i++) {
      out += '<circle cx="' + (rnd() * W).toFixed(1) + '" cy="' + (rnd() * H).toFixed(1) + '" r="' + (rnd() * 0.9 + 0.2).toFixed(2) +
        '" fill="#e9e6dc" fill-opacity="' + (rnd() * 0.35 + 0.05).toFixed(2) + '"/>';
    }
    return out;
  }

  function renderChart() {
    var scenes = state.product.scenes;
    var s = '<defs><radialGradient id="glow"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>';
    s += starfield();
    // 网格与刻度
    [0, 25, 50, 75, 100].forEach(function (v) {
      s += '<line class="grid-line" x1="' + px(v) + '" y1="' + T + '" x2="' + px(v) + '" y2="' + (H - B) + '"/>';
      s += '<line class="grid-line" x1="' + L + '" y1="' + py(v) + '" x2="' + (W - R) + '" y2="' + py(v) + '"/>';
      s += '<text class="tick" x="' + px(v) + '" y="' + (H - B + 18) + '" text-anchor="middle">' + v + "</text>";
      s += '<text class="tick" x="' + (L - 10) + '" y="' + (py(v) + 4) + '" text-anchor="end">' + v + "</text>";
    });
    // 机会区
    s += '<rect class="opp-zone" x="' + px(55) + '" y="' + py(45) + '" width="' + (px(100) - px(55)) + '" height="' + (py(0) - py(45)) + '"/>';
    s += '<text class="quad-label opp" x="' + (px(100) - 10) + '" y="' + (py(0) - 12) + '" text-anchor="end">机会区 · 需求高 写的人少</text>';
    s += '<text class="quad-label" x="' + (px(100) - 10) + '" y="' + (py(100) + 20) + '" text-anchor="end">红海 · 需求高 但很拥挤</text>';
    s += '<text class="quad-label" x="' + (px(0) + 10) + '" y="' + (py(100) + 20) + '">内卷 · 需求低 也拥挤</text>';
    s += '<text class="quad-label" x="' + (px(0) + 10) + '" y="' + (py(0) - 12) + '">小众 · 等待时机</text>';
    // 坐标轴标题
    s += '<text class="axis-label" x="' + ((L + W - R) / 2) + '" y="' + (H - 12) + '" text-anchor="middle">需求强度 →</text>';
    s += '<text class="axis-label" transform="translate(18 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">内容拥挤度 →</text>';
    // 星座连线
    Object.keys(CIRCLES).forEach(function (c) {
      if (!state.filters[c]) return;
      var pts = scenes.filter(function (q) { return q.circle === c; }).sort(function (a, b) { return a.x - b.x; });
      if (pts.length > 1) {
        s += '<polyline class="const-line" stroke="' + CIRCLES[c].color + '" points="' +
          pts.map(function (q) { return px(q.x) + "," + py(q.y); }).join(" ") + '"/>';
      }
    });
    // 星
    scenes.forEach(function (q, i) {
      var r = 4 + q.size * 3.2, col = CIRCLES[q.circle].color;
      var cls = "star" + (state.filters[q.circle] ? "" : " dim") + (state.picked.indexOf(q.id) > -1 ? " picked" : "");
      s += '<g class="' + cls + '" data-i="' + i + '" tabindex="' + (state.filters[q.circle] ? 0 : -1) + '" role="button" aria-label="' + esc(q.title) + '">' +
        '<circle class="halo" cx="' + px(q.x) + '" cy="' + py(q.y) + '" r="' + (r * 2.6) + '" fill="' + col + '" style="animation-delay:-' + ((i * 0.37) % 3.6).toFixed(2) + 's"/>' +
        '<circle class="ring" cx="' + px(q.x) + '" cy="' + py(q.y) + '" r="' + (r + 6) + '"/>' +
        '<circle class="core" cx="' + px(q.x) + '" cy="' + py(q.y) + '" r="' + r + '" fill="' + col + '"/>' +
        '<text class="num" x="' + (px(q.x) + r + 5) + '" y="' + (py(q.y) - r + 2) + '">' + String(i + 1).padStart(2, "0") + "</text></g>";
    });
    var svg = $("chart");
    svg.innerHTML = s;
    svg.querySelectorAll(".star").forEach(function (g) {
      var i = +g.getAttribute("data-i");
      g.addEventListener("click", function () { openDrawer(i); });
      g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDrawer(i); } });
      g.addEventListener("mouseenter", function () { showTip(i, g); });
      g.addEventListener("mouseleave", hideTip);
      g.addEventListener("focus", function () { showTip(i, g); });
      g.addEventListener("blur", hideTip);
    });
  }

  function showTip(i, g) {
    var q = state.product.scenes[i], tip = $("tooltip");
    var wrap = $("chart-wrap").getBoundingClientRect();
    var b = g.querySelector(".core").getBoundingClientRect();
    tip.innerHTML = "<b>" + esc(q.title) + "</b><span>" + CIRCLES[q.circle].name + " · 需求 " + q.x + " · 拥挤 " + q.y + "</span>";
    tip.hidden = false;
    var left = b.left - wrap.left + b.width / 2 - tip.offsetWidth / 2;
    left = Math.max(8, Math.min(left, wrap.width - tip.offsetWidth - 8));
    var top = b.top - wrap.top - tip.offsetHeight - 10;
    if (top < 8) top = b.bottom - wrap.top + 10;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hideTip() { $("tooltip").hidden = true; }

  function renderList() {
    var scenes = state.product.scenes;
    var order = scenes.map(function (s, i) { return i; }).filter(function (i) { return state.filters[scenes[i].circle]; })
      .sort(function (a, b) { return oppScore(scenes[b]) - oppScore(scenes[a]); });
    $("scene-list").innerHTML = order.map(function (i) {
      var q = scenes[i];
      return '<button type="button" class="scene-card" data-i="' + i + '"><span class="top"><span>' + catalog(q, i) + "</span>" +
        (isOpp(q) ? '<span class="badge-opp">机会区</span>' : "<span>" + CIRCLES[q.circle].name + "</span>") + "</span>" +
        "<h3>" + esc(q.title) + "</h3>" +
        '<span class="bars"><span>需求</span><span class="bar"><i style="width:' + q.x + '%"></i></span>' +
        '<span>拥挤</span><span class="bar crowd"><i style="width:' + q.y + '%"></i></span></span></button>';
    }).join("");
    $("scene-list").querySelectorAll(".scene-card").forEach(function (b) {
      b.addEventListener("click", function () { openDrawer(+b.getAttribute("data-i")); });
    });
  }

  function setMode(m) {
    state.mode = m;
    $("chart-wrap").hidden = m !== "chart";
    $("scene-list").hidden = m !== "list";
    $("mode-chart").setAttribute("aria-pressed", m === "chart");
    $("mode-list").setAttribute("aria-pressed", m === "list");
  }
  $("mode-chart").addEventListener("click", function () { setMode("chart"); });
  $("mode-list").addEventListener("click", function () { setMode("list"); });

  /* ───────── 场景抽屉 ───────── */
  var drawerIndex = -1;

  function radarSvg(y) {
    var r = 30, c = 2 * Math.PI * r, col = y >= 65 ? "#ff2442" : y >= 45 ? "#f2b880" : "#7fdccb";
    return '<svg viewBox="0 0 76 76" aria-hidden="true"><circle cx="38" cy="38" r="' + r + '" fill="none" stroke="#1d2a52" stroke-width="6"/>' +
      '<circle cx="38" cy="38" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="6" stroke-linecap="round" stroke-dasharray="' +
      (c * y / 100).toFixed(1) + " " + c.toFixed(1) + '" transform="rotate(-90 38 38)"/>' +
      '<text x="38" y="43" text-anchor="middle" fill="#e9e6dc" font-family="IBM Plex Mono, monospace" font-size="16">' + y + "</text></svg>";
  }

  function coverHtml(q) {
    var sub = { center: "left:18%;right:18%;top:24%;bottom:24%", left: "left:8%;width:46%;top:20%;bottom:16%", "top-left": "left:8%;width:60%;top:8%;height:52%" }[q.cover.layout] || "left:18%;right:18%;top:24%;bottom:24%";
    var band = q.cover.text === "top" ? "top:8px" : "bottom:8px";
    if (q.cover.layout === "top-left" && q.cover.text === "top") band = "bottom:8px";
    return '<div class="cover" aria-hidden="true"><div class="subject" style="' + sub + '">' + esc(q.cover.subject) + "</div>" +
      '<div class="text-band" style="' + band + '">' + esc(q.titles[0]) + "</div></div>";
  }

  function openDrawer(i) {
    hideTip();
    drawerIndex = i;
    var q = state.product.scenes[i];
    var c = CIRCLES[q.circle];
    $("d-cat").textContent = catalog(q, i) + (isOpp(q) ? " · 机会区" : "");
    var mag = magnitude(q);
    $("d-body").innerHTML =
      '<div><h2 class="d-title" id="d-title">' + esc(q.title) + '</h2><span class="d-circle"><i style="background:' + c.color + '"></i>' + c.name + "</span></div>" +
      '<div class="metrics"><div><span class="v">' + q.x + '</span><span class="l">需求强度</span></div>' +
      '<div><span class="v">' + q.y + '</span><span class="l">内容拥挤度</span></div>' +
      '<div><span class="v">' + mag + ' 等星</span><span class="l">人群规模（示意）</span></div></div>' +
      '<div class="block"><h4>那一刻</h4><p class="moment">' + esc(q.moment) + "</p></div>" +
      '<div class="block"><h4>真实痛点</h4><ul>' + q.pains.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>" +
      '<div class="block"><h4>她会这样搜</h4><div class="searchbars">' + q.searches.map(function (t) { return '<div class="searchbar">' + esc(t) + "</div>"; }).join("") + "</div></div>" +
      '<div class="block"><h4>打动她的点</h4><ul>' + q.hooks.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>" +
      '<div class="block"><h4>同质化雷达</h4><div class="radar">' + radarSvg(q.y) + '<div><p class="verdict">' + crowdVerdict(q.y) +
      "</p><ul>" + q.worn.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div></div></div>" +
      '<div class="block"><h4>笔记标题建议</h4><div class="titles">' + q.titles.map(function (t, k) {
        return '<div class="title-row"><span>' + esc(t) + '</span><button type="button" data-copy="' + k + '">复制</button></div>';
      }).join("") + "</div></div>" +
      '<div class="block"><h4>封面构图建议 · 3:4</h4><div class="cover-wrap">' + coverHtml(q) +
      '<div class="cover-note"><span><b>主体：</b>' + esc(q.cover.subject) + "</span><span>" + esc(q.cover.note) + "</span></div></div></div>";
    $("d-body").querySelectorAll("[data-copy]").forEach(function (b) {
      b.addEventListener("click", function () { copyText(q.titles[+b.getAttribute("data-copy")], "标题已复制"); });
    });
    $("d-body").scrollTop = 0;
    updatePickBtn();
    $("drawer").classList.add("open");
    $("drawer").setAttribute("aria-hidden", "false");
    $("scrim").classList.add("open");
    document.querySelectorAll(".star").forEach(function (g) { g.classList.toggle("active", +g.getAttribute("data-i") === i); });
    setTimeout(function () { $("d-close").focus(); }, 50);
  }

  function closeDrawer() {
    if (!$("drawer").classList.contains("open")) return;
    $("drawer").classList.remove("open");
    $("drawer").setAttribute("aria-hidden", "true");
    $("scrim").classList.remove("open");
    document.querySelectorAll(".star.active").forEach(function (g) { g.classList.remove("active"); });
  }

  function stepDrawer(dir) {
    var scenes = state.product.scenes;
    var vis = scenes.map(function (s, i) { return i; }).filter(function (i) { return state.filters[scenes[i].circle]; })
      .sort(function (a, b) { return scenes[a].x - scenes[b].x; });
    var pos = vis.indexOf(drawerIndex);
    if (pos < 0) pos = 0;
    openDrawer(vis[(pos + dir + vis.length) % vis.length]);
  }

  function updatePickBtn() {
    var q = state.product.scenes[drawerIndex];
    var on = state.picked.indexOf(q.id) > -1;
    var full = !on && state.picked.length >= MAX_PICK;
    var b = $("d-pick");
    b.textContent = on ? "已加入 · 点击移除" : full ? "清单已满（" + MAX_PICK + " 个）" : "加入策展清单";
    b.disabled = full;
    b.classList.toggle("btn-primary", !on);
  }

  $("d-pick").addEventListener("click", function () {
    var q = state.product.scenes[drawerIndex];
    var k = state.picked.indexOf(q.id);
    if (k > -1) { state.picked.splice(k, 1); toast("已从清单移除"); }
    else if (state.picked.length < MAX_PICK) { state.picked.push(q.id); toast("已加入策展清单（" + state.picked.length + "/" + MAX_PICK + "）"); }
    updatePickBtn();
    renderChart();
    document.querySelectorAll(".star").forEach(function (g) { g.classList.toggle("active", +g.getAttribute("data-i") === drawerIndex); });
    renderTray();
  });
  $("d-close").addEventListener("click", closeDrawer);
  $("scrim").addEventListener("click", closeDrawer);
  $("d-prev").addEventListener("click", function () { stepDrawer(-1); });
  $("d-next").addEventListener("click", function () { stepDrawer(1); });
  document.addEventListener("keydown", function (e) {
    if (!$("drawer").classList.contains("open")) return;
    if (e.key === "Escape") closeDrawer();
    if (e.key === "ArrowRight") stepDrawer(1);
    if (e.key === "ArrowLeft") stepDrawer(-1);
  });

  /* ───────── 托盘 ───────── */
  function renderTray() {
    var n = state.picked.length, slots = "";
    for (var i = 0; i < MAX_PICK; i++) slots += '<span class="slot' + (i < n ? " on" : "") + '"></span>';
    $("tray-picked").innerHTML = slots + "<span>" + (n ? "已选 " + n + " 个场景" : "点击星星，把想打的场景加入清单") + "</span>";
    $("tray-go").disabled = n === 0;
    $("step-plan").disabled = n === 0;
  }
  $("tray-go").addEventListener("click", function () { go("plan"); });

  /* ───────── 03 策划 ───────── */
  function pickedScenes() {
    var scenes = state.product.scenes;
    return state.picked.map(function (id) {
      for (var i = 0; i < scenes.length; i++) if (scenes[i].id === id) return { s: scenes[i], i: i };
    }).filter(Boolean).sort(function (a, b) { return oppScore(b.s) - oppScore(a.s); });
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
  }

  function renderPlan() {
    var root = $("plan-root");
    if (!state.product || !state.picked.length) {
      root.innerHTML = '<div class="empty"><p>清单还是空的。回到星图，点开星星，把想打的场景加入清单。</p></div>';
      $("plan-copy").disabled = true;
      return;
    }
    $("plan-copy").disabled = false;
    var items = pickedScenes();
    var opp = items.filter(function (it) { return isOpp(it.s); }).length;
    var circles = {};
    items.forEach(function (it) { circles[it.s.circle] = true; });
    var html = '<article class="sheet"><header class="sheet-head"><div><p class="kicker">一物千景 · 本周种草策划</p>' +
      "<h1>" + esc(state.product.name) + "：" + items.length + " 个瞬间</h1>" +
      '<p class="sub">' + esc(state.product.tagline) + " · " + esc(state.product.price) + "</p></div>" +
      '<div class="issue">生成于 ' + today() + "<br>按机会分排序<br>" + (state.product.custom ? "组合生成 · 示意" : "示例商品 · 示意数据") + "</div></header>" +
      '<div class="sheet-intro"><div><span class="v">' + items.length + '</span><br><span class="l">篇笔记</span></div>' +
      '<div><span class="v">' + opp + '</span><br><span class="l">来自机会区</span></div>' +
      '<div><span class="v">' + Object.keys(circles).length + '</span><br><span class="l">覆盖兴趣圈层</span></div></div>';
    items.forEach(function (it, k) {
      var q = it.s, a = advice(q);
      html += '<section class="entry"><div class="day">' + DAYS[k] + "<small>" + catalog(q, it.i) + "</small></div>" +
        "<div><h3>" + esc(q.title) + '</h3><p class="who">' + CIRCLES[q.circle].name + " · 需求 " + q.x + " · 拥挤 " + q.y + "</p>" +
        '<p class="headline">' + esc(q.titles[0]) + "</p>" +
        '<div class="kw">' + q.searches.slice(0, 3).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div></div>" +
        "<dl><div><dt>发布建议</dt><dd><span class=\"" + (a.opp ? "tag-opp" : "") + '">' + a.tag + "</span> · " + a.text + "</dd></div>" +
        "<div><dt>打动点</dt><dd>" + esc(q.hooks[0]) + "</dd></div>" +
        "<div><dt>封面</dt><dd>" + esc(q.cover.subject) + "。" + esc(q.cover.note) + "</dd></div></dl></section>";
    });
    html += '<footer class="sheet-foot"><span>人群规模与拥挤度为示意数据，正式版本可接入平台搜索与笔记数据。</span><span>一物千景</span></footer></article>';
    root.innerHTML = html;
  }

  function planText() {
    var items = pickedScenes();
    var out = ["【" + state.product.name + " · 本周种草策划】", state.product.tagline + " · " + state.product.price, ""];
    items.forEach(function (it, k) {
      var q = it.s, a = advice(q);
      out.push(DAYS[k] + "｜" + q.title + "（" + CIRCLES[q.circle].name + "）");
      out.push("首选标题：" + q.titles[0]);
      out.push("备选标题：" + q.titles.slice(1).join(" / "));
      out.push("核心搜索词：" + q.searches.join("、"));
      out.push("打动点：" + q.hooks.join("；"));
      out.push("封面：" + q.cover.subject + "。" + q.cover.note);
      out.push("发布建议：" + a.tag + "，" + a.text);
      out.push("");
    });
    out.push("（人群规模与拥挤度为示意数据）");
    return out.join("\n");
  }

  $("plan-copy").addEventListener("click", function () { copyText(planText(), "策划文案已复制"); });
  $("plan-back").addEventListener("click", function () { go("map"); });

  /* ───────── 工具 ───────── */
  function copyText(text, msg) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? msg : "复制失败，请手动选择文字复制");
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast(msg); }, fallback);
      } else fallback();
    } catch (e) { fallback(); }
  }

  var toastTimer;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }

  document.querySelectorAll("[data-go]").forEach(function (b) {
    b.addEventListener("click", function () { if (!b.disabled) go(b.getAttribute("data-go")); });
  });
  $("brand").addEventListener("click", function () { go("home"); });

  // 窄屏默认列表视图更易点按
  if (window.matchMedia && window.matchMedia("(max-width: 560px)").matches) setMode("list");

  renderSamples();
  go("home");
})();
