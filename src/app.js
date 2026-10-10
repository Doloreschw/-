/* 一物千景 · 交互逻辑（纯前端，无后端依赖） */
(function () {
  "use strict";

  var CIRCLES = window.CIRCLES, PRODUCTS = window.PRODUCTS, LIB = window.SCENE_LIBRARY;
  var MARKET = window.MARKET, PLATFORM = window.PLATFORM, SCENE_AGE = window.SCENE_AGE, JD_NOTE = window.JD_NOTE;
  var AGES = ["18-24", "25-30", "31-40", "41+"];
  var MAX_PICK = 6;
  var DAYS = ["周一", "周二", "周三", "周四", "周五", "周六"];
  var SAMPLE_PRICE = { cup: 129, candle: 168, tote: 299, coffee: 39 }; // 示例定价，可拖动修改

  var state = {
    product: null, myPrice: null, comps: [],
    segFilter: null, brandFilter: null, binSel: -1, brandSort: "n",
    filters: {}, ageFilter: null, picked: [], mode: "chart"
  };

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  };
  var fmt = function (n) { return (Math.round(n * 100) / 100).toString(); };
  var jdUrl = function (sku) { return "https://item.jd.com/" + sku + ".html"; };
  var src = function (kind) {
    return kind === "org" ? '<span class="src src-org">机构数据</span>' : kind === "jd" ? '<span class="src src-jd">京东实采</span>' : '<span class="src src-ai">AI 评估</span>';
  };

  /* ───────── 场景指标 ───────── */
  function isOpp(s) { return s.x >= 55 && s.y <= 45; }
  function oppScore(s) { return Math.round(s.x * 0.6 + (100 - s.y) * 0.4); }
  function catalog(i) { return state.product.code + "·" + String(i + 1).padStart(2, "0"); }
  function crowdVerdict(y) {
    if (y >= 65) return "红海：这个角度已经被写了很多";
    if (y >= 45) return "中等：有人写过，仍有差异化空间";
    return "蓝海：很少看到商家从这个角度写";
  }
  function advice(s) {
    if (isOpp(s)) return { tag: "机会区", text: "优先发布。用真实素人口吻，首发后可小额加热测试。", opp: true };
    if (s.y >= 65) return { tag: "红海", text: "不建议首发。只有找到明显的差异角度时再写。", opp: false };
    if (s.x < 45) return { tag: "小众", text: "需求偏小，适合配合节日或话题节点发布。", opp: false };
    return { tag: "稳健", text: "可作为常规内容补充，保持账号的场景多样性。", opp: false };
  }

  function seeded(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () {
      h += 0x6D2B79F5; var t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ───────── 自定义商品：场景库组合生成 ───────── */
  function generate(name, point) {
    var rnd = seeded(name);
    var pool = LIB.slice();
    for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    var sell = point || "刚好合用";
    var scenes = pool.slice(0, 12).map(function (p, k) {
      var y = Math.round(10 + rnd() * 80);
      var layouts = ["center", "left", "top-left"];
      return {
        id: "c" + k, title: p.who, circle: p.circle, age: CIRCLES[p.circle].age,
        x: Math.min(94, Math.round(30 + rnd() * 62)), y: y, size: 1 + Math.floor(rnd() * 3),
        moment: p.when + "，" + p.who + "最在意的是" + p.pain + "。如果手边刚好有一个" + name + "，" + sell + "。",
        pains: [p.pain, "不确定" + name + "是否适合自己的情况"],
        searches: [p.search, p.search.split(" ")[0] + " " + name, name + " 推荐", name + " 真实体验"],
        hooks: [sell, "正好回应“" + p.pain + "”这件事"],
        worn: y >= 55 ? [name + "测评大合集", "开箱加参数对比的固定套路"] : ["这个场景下还很少看到" + name + "的内容"],
        titles: [p.when + "，我带上了" + name, p.who + "的" + name + "清单", "给" + p.pain.replace(/^[很太]/, "") + "的人：试试" + name],
        cover: { layout: layouts[Math.floor(rnd() * 3)], text: rnd() > 0.5 ? "top" : "bottom", subject: p.who + "与" + name + "同框", note: "先让人看出是“" + p.when + "”，商品只占画面一角" }
      };
    });
    return { id: null, name: name, tagline: point || "自定义商品", code: "NEW", custom: true, path: ["自定义商品"], scenes: scenes, market: null };
  }

  function loadSample(id) {
    var p = PRODUCTS.filter(function (q) { return q.id === id; })[0];
    var scenes = p.scenes.map(function (s) { var c = Object.assign({}, s); c.age = SCENE_AGE[s.id] || CIRCLES[s.circle].age; return c; });
    return { id: id, name: p.name, tagline: p.tagline, code: id.toUpperCase(), custom: false, path: MARKET[id].path, scenes: scenes, market: MARKET[id] };
  }

  /* ───────── 视图切换 ───────── */
  var VIEWS = ["home", "market", "map", "plan"];
  function go(view) {
    VIEWS.forEach(function (v) {
      $("view-" + v).hidden = v !== view;
      var b = $("step-" + v);
      if (v === view) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    $("step-market").disabled = !state.product;
    $("step-map").disabled = !state.product;
    $("step-plan").disabled = state.picked.length === 0;
    $("tray").hidden = view !== "map";
    closeDrawer();
    if (view === "plan") renderPlan();
    window.scrollTo(0, 0);
  }

  function start(product, price) {
    var loading = $("loading"), lines = loading.querySelectorAll(".line");
    lines.forEach(function (l) { l.classList.remove("on"); });
    loading.hidden = false;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var step = reduce ? 120 : 500;
    lines.forEach(function (l, i) { setTimeout(function () { l.classList.add("on"); }, step * i + 80); });
    setTimeout(function () {
      state.product = product;
      state.myPrice = price || (product.id ? SAMPLE_PRICE[product.id] : null);
      state.priceIsSample = !price && !!product.id;
      state.comps = []; state.segFilter = null; state.brandFilter = null; state.binSel = -1;
      state.picked = []; state.ageFilter = null; state.filters = {};
      Object.keys(CIRCLES).forEach(function (c) { state.filters[c] = true; });
      loading.hidden = true;
      renderMarket(); renderMap();
      go("market");
    }, step * 3 + 200);
  }

  /* ───────── 01 首页 ───────── */
  function miniConstellation(scenes) {
    var w = 280, h = 140, pad = 14, svg = '<svg viewBox="0 0 ' + w + " " + h + '" aria-hidden="true">';
    var ox = pad + 0.55 * (w - 2 * pad), oy = pad + 0.55 * (h - 2 * pad);
    svg += '<rect x="' + ox + '" y="' + oy + '" width="' + (w - pad - ox) + '" height="' + (h - pad - oy) + '" rx="8" fill="#fff0f2"/>';
    scenes.forEach(function (s) {
      svg += '<circle cx="' + (pad + s.x / 100 * (w - 2 * pad)) + '" cy="' + (pad + (1 - s.y / 100) * (h - 2 * pad)) + '" r="' + (2 + s.size * 1.6) + '" fill="' + CIRCLES[s.circle].color + '"/>';
    });
    return svg + "</svg>";
  }
  function renderSamples() {
    $("samples").innerHTML = PRODUCTS.map(function (p) {
      var m = MARKET[p.id];
      return '<button type="button" class="sample" data-id="' + p.id + '">' + miniConstellation(p.scenes) +
        '<div class="meta"><span class="path">' + m.path.join(" › ") + '</span><span class="name">' + esc(p.name) + "</span>" +
        '<span class="stat">' + m.skus.length + " 个实采 SKU · 机会区 <b>" + p.scenes.filter(isOpp).length + "</b> 个</span></div></button>";
    }).join("");
    $("samples").querySelectorAll(".sample").forEach(function (b) {
      b.addEventListener("click", function () { start(loadSample(b.getAttribute("data-id")), null); });
    });
  }
  $("product-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("f-name").value.trim();
    if (!name) { $("f-error").hidden = false; $("f-name").focus(); return; }
    $("f-error").hidden = true;
    var price = parseFloat($("f-price").value) || null;
    var match = PRODUCTS.filter(function (p) { return p.name === name || name.indexOf(p.name.replace("便携", "")) > -1; })[0];
    start(match ? loadSample(match.id) : generate(name, $("f-point").value.trim()), price);
  });

  /* ───────── 02 品类档案 ───────── */
  function allSkus() {
    var m = state.product.market;
    var base = m ? m.skus : [];
    return base.concat(state.comps);
  }
  function filteredSkus() {
    return allSkus().filter(function (s) {
      if (s.mine) return true;
      if (state.segFilter && s.seg !== state.segFilter) return false;
      if (state.brandFilter && s.b !== state.brandFilter) return false;
      return true;
    });
  }
  function bins() {
    var m = state.product.market;
    if (m) return m.bins;
    var ps = state.comps.map(function (c) { return c.p; }).concat(state.myPrice ? [state.myPrice] : []);
    var mx = Math.max.apply(null, ps.concat([100]));
    var step = Math.pow(10, Math.floor(Math.log10(mx / 6))) * (mx / 6 / Math.pow(10, Math.floor(Math.log10(mx / 6))) > 5 ? 5 : mx / 6 / Math.pow(10, Math.floor(Math.log10(mx / 6))) > 2 ? 2 : 1);
    var out = []; for (var v = 0; v <= mx + step; v += step) out.push(v);
    return out.length > 2 ? out : [0, 50, 100];
  }
  function binOf(p, b) { for (var i = 0; i < b.length - 1; i++) if (p < b[i + 1]) return i; return b.length - 2; }
  function binLabel(i, b) { return i === b.length - 2 ? b[i] + "+" : b[i] + "–" + b[i + 1]; }
  function median(a) { if (!a.length) return 0; var s = a.slice().sort(function (x, y) { return x - y; }); var m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

  function renderMarket() {
    var p = state.product, m = p.market;
    $("m-crumbs").innerHTML = p.path.map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("");
    $("m-title").textContent = p.name;
    $("m-tagline").textContent = p.tagline;
    var skus = m ? m.skus : [];
    var brands = {}; skus.forEach(function (s) { brands[s.b] = 1; });
    $("m-readout").innerHTML = m ?
      '<div><span class="v">' + skus.length + '</span><span class="l">实采 SKU</span></div>' +
      '<div><span class="v">' + Object.keys(brands).length + '</span><span class="l">品牌</span></div>' +
      '<div><span class="v">¥' + fmt(median(skus.map(function (s) { return s.p; }))) + '</span><span class="l">样本价格中位数</span></div>' : "";

    var h = "";
    if (!m) {
      h += '<p class="notice">这个品类还没有接入机构数据和京东实采价格。你可以在下面的价格带里添加自己调研到的竞品价格，工具会自动切分价格带并显示你的定位。</p>';
    }
    h += '<div class="dossier">';
    if (m) {
      h += '<section class="card span-7"><div class="card-head"><div><h3>' + esc(m.size.title) + '</h3><p>单位：' + m.size.unit + "</p></div>" + src("org") + "</div>" +
        '<div class="trend" id="trend"></div>' +
        '<p class="muted" style="margin-top:8px">来源：<a class="src-link" href="' + m.size.url + '" target="_blank" rel="noopener">' + esc(m.size.src) + "</a>" +
        (m.size.alt ? "。" + esc(m.size.alt) : "") + "</p></section>";
      h += '<section class="card span-5"><div class="card-head"><div><h3>关键事实</h3><p>每条附原文出处</p></div>' + src("org") + '</div><div class="facts">' +
        m.facts.map(function (f) {
          return '<div class="fact"><span class="k">' + esc(f.k) + '</span><span class="v">' + esc(f.v) + '</span><span class="meta"><span>' + esc(f.yr) +
            '</span><a class="src-link" href="' + f.url + '" target="_blank" rel="noopener">' + esc(f.src) + "</a></span></div>";
        }).join("") + "</div></section>";
    }
    // 价格带
    h += '<section class="card span-12"><div class="card-head"><div><h3>同类 SKU 细分价格带</h3><p>' +
      (m ? "点击柱子查看该价格带里的商品；在下方细分类型或品牌表里点选，可联动筛选" : "添加竞品价格后自动生成") + "</p></div>" + (m ? src("jd") : "") + "</div>" +
      '<div class="price-tools"><label for="my-price">你的定价</label><input type="range" id="my-price-range" aria-label="拖动调整你的定价">' +
      '<input type="number" id="my-price" min="1">' + '<span class="muted" id="price-hint"></span></div>' +
      '<div class="hist" id="hist"></div><div class="position" id="position"></div>' +
      '<div class="sku-head"><span id="sku-head-t"></span><span id="filter-pills"></span></div>' +
      '<div class="sku-list" id="sku-list"></div>' +
      '<form class="add-comp" id="add-comp"><input id="comp-name" placeholder="添加你调研到的竞品，例如：某品牌 500ml 保温杯" maxlength="40"><input id="comp-price" type="number" min="0.1" step="0.01" placeholder="价格"><button class="btn btn-sm" type="submit">添加</button></form>' +
      "</section>";
    if (m) {
      h += '<section class="card span-6"><div class="card-head"><div><h3>' + (p.id === "tote" ? "品牌类型" : "细分类型") + '</h3><p>' +
        (p.id === "tote" ? "按样本品牌归类" : "按样本商品标题关键词归类") + "，点击筛选</p></div>" + src("jd") + '</div><div class="hbars" id="segs"></div></section>';
      h += '<section class="card span-6"><div class="card-head"><div><h3>品牌格局</h3><p>样本内统计，点击行筛选</p></div>' + src("jd") + "</div>" +
        '<p class="share-note">' + src("org") + " " + esc(m.share_note) + '</p><div class="table-wrap" id="brands"></div>' +
        '<p class="muted" style="margin-top:8px">“展示销量”取京东页面上的“已售 X+”下限加总，统计口径由平台决定，只能用来比较样本内的相对热度，不等于市场份额。</p></section>';
    }
    // 人群
    var ageCount = {}; p.scenes.forEach(function (s) { ageCount[s.age] = (ageCount[s.age] || 0) + 1; });
    h += '<section class="card span-12"><div class="card-head"><div><h3>聚焦人群与年龄段</h3><p>平台人群用机构数据，场景人群是 AI 评估；点击年龄段直接去星图筛选</p></div></div><div class="age-grid">' +
      '<div class="age-block"><h4>' + esc(PLATFORM.title) + " " + src("org") + "</h4>" + PLATFORM.bars.map(function (b) {
        return '<div class="hbar" style="cursor:default"><span>' + b.k + '</span><span class="track"><span class="fill" style="width:' + b.v + '%;display:block"></span></span><span class="c">' + b.v + "%</span></div>";
      }).join("") + '<p class="muted" style="margin-top:6px">' + esc(PLATFORM.extra) + "。" + esc(PLATFORM.note) + ' 来源：<a class="src-link" href="' + PLATFORM.url + '" target="_blank" rel="noopener">' + esc(PLATFORM.src) + "</a></p>" +
      (m && m.age.length ? m.age.map(function (a) { return '<p class="quote">' + src("org") + " " + esc(a.txt) + ' · <a class="src-link" href="' + a.url + '" target="_blank" rel="noopener">' + esc(a.src) + "</a></p>"; }).join("") :
        '<p class="quote">本品类按年龄段的消费人群占比，暂无可靠公开数据。</p>') + "</div>" +
      '<div class="age-block"><h4>本商品 12 个场景的人群年龄 ' + src("ai") + '</h4><div class="age-chips">' +
      AGES.filter(function (a) { return ageCount[a]; }).map(function (a) {
        return '<button type="button" class="age-chip" data-age="' + a + '"><span class="v">' + ageCount[a] + ' 个</span><span class="l">' + a + " 岁 · 去星图看 →</span></button>";
      }).join("") + "</div></div></div></section>";
    // 来源
    if (m) {
      var urls = {}; [m.size].concat(m.facts).concat(m.age).concat([PLATFORM]).forEach(function (f) { urls[f.url] = f.src; });
      h += '<section class="card span-12 sources"><h3 style="font-size:14px;color:var(--ink)">数据说明与来源</h3><p>' + src("jd") + " " + esc(JD_NOTE) + " 每个 SKU 都可以点“看原页”打开京东商品页核对。</p><ol>" +
        Object.keys(urls).map(function (u) { return '<li><a href="' + u + '" target="_blank" rel="noopener">' + esc(urls[u]) + "</a></li>"; }).join("") + "</ol></section>";
    }
    h += "</div>";
    h += '<div class="dossier-cta"><button class="btn btn-dark" type="button" id="to-map">去看场景星图 →</button></div>';
    $("m-root").innerHTML = h;

    if (m) renderTrend();
    setupPrice();
    renderPriceBlock();
    if (m) { renderSegs(); renderBrands(); }

    $("m-root").querySelectorAll(".age-chip").forEach(function (b) {
      b.addEventListener("click", function () { state.ageFilter = b.getAttribute("data-age"); renderMap(); go("map"); });
    });
    $("to-map").addEventListener("click", function () { go("map"); });
    $("add-comp").addEventListener("submit", function (e) {
      e.preventDefault();
      var n = $("comp-name").value.trim(), pr = parseFloat($("comp-price").value);
      if (!n || !(pr > 0)) { toast("请填写竞品名称和价格"); return; }
      state.comps.push({ sku: null, t: n, p: pr, b: "你添加的", seg: "你添加的", sf: 0, mine: true });
      $("comp-name").value = ""; $("comp-price").value = "";
      if (!m) setupPrice();
      renderPriceBlock(); toast("已添加竞品");
    });
  }

  function renderTrend() {
    var s = state.product.market.size, pts = s.points;
    if (pts.length < 2) {
      $("trend").innerHTML = '<div class="big-figure"><span class="v">' + pts[0].v + '</span><span class="u">' + s.unit + "（" + pts[0].y + "）</span>" +
        (s.growth ? '<span class="g">' + esc(s.growth) + "</span>" : "") + "</div>" +
        '<p class="muted" style="margin-top:8px">公开报道只找到这一年的可靠数字，所以这里不画走势线，避免用推算值填满图表。</p>';
      return;
    }
    var W = 600, H = 240, L = 20, R = 20, T = 30, B = 32, max = Math.max.apply(null, pts.map(function (p) { return p.v; })) * 1.12;
    var bw = Math.min(90, (W - L - R) / pts.length * 0.5), step = (W - L - R) / pts.length;
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(s.title) + '">';
    svg += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>';
    pts.forEach(function (p, i) {
      var x = L + step * i + step / 2 - bw / 2, bh = (p.v / max) * (H - T - B), y = H - B - bh;
      svg += '<rect class="tb ' + (p.e ? "est" : "solid") + '" x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '" rx="6"/>';
      svg += '<text class="val" x="' + (x + bw / 2) + '" y="' + (y - 8) + '" text-anchor="middle">' + p.v + "</text>";
      svg += '<text class="axis" x="' + (x + bw / 2) + '" y="' + (H - 10) + '" text-anchor="middle">' + p.y + "</text>";
    });
    $("trend").innerHTML = svg + "</svg>" + '<p class="muted">年份间隔不等，按报告实际给出的年份排列；虚线框为机构预测值。</p>';
  }

  function setupPrice() {
    var b = bins(), r = $("my-price-range"), n = $("my-price");
    r.min = 1; r.max = b[b.length - 1]; r.step = b[b.length - 1] > 500 ? 5 : 1;
    if (state.myPrice) { r.value = Math.min(state.myPrice, b[b.length - 1]); n.value = state.myPrice; }
    $("price-hint").textContent = state.priceIsSample ? "示例定价，可拖动修改" : (state.myPrice ? "" : "填写后显示你的定位");
    r.oninput = function () { state.myPrice = +r.value; state.priceIsSample = false; n.value = r.value; $("price-hint").textContent = ""; renderPriceBlock(); };
    n.oninput = function () { var v = parseFloat(n.value); state.myPrice = v > 0 ? v : null; state.priceIsSample = false; if (v > 0) r.value = Math.min(v, +r.max); $("price-hint").textContent = ""; renderPriceBlock(); };
  }

  function renderPriceBlock() {
    var b = bins(), list = filteredSkus(), n = b.length - 1;
    var counts = new Array(n).fill(0); list.forEach(function (s) { counts[binOf(s.p, b)]++; });
    var max = Math.max.apply(null, counts.concat([1]));
    var W = 1000, H = 240, L = 4, R = 4, T = 26, B = 34, gap = 8, bw = (W - L - R) / n - gap;
    var myBin = state.myPrice ? binOf(state.myPrice, b) : -1;
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="价格带分布">';
    for (var i = 0; i < n; i++) {
      var x = L + i * (bw + gap) + gap / 2, bh = counts[i] ? Math.max(6, counts[i] / max * (H - T - B)) : 2, y = H - B - bh;
      var cls = "hb" + (i === state.binSel ? " sel" : i === myBin ? " mine" : "");
      svg += '<rect class="' + cls + '" data-bin="' + i + '" x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '" rx="6" tabindex="0" role="button" aria-label="' + binLabel(i, b) + "元，" + counts[i] + '个"/>';
      svg += '<text class="cnt" x="' + (x + bw / 2) + '" y="' + (y - 7) + '" text-anchor="middle">' + counts[i] + "</text>";
      svg += '<text class="lbl" x="' + (x + bw / 2) + '" y="' + (H - 12) + '" text-anchor="middle">' + binLabel(i, b) + "</text>";
    }
    svg += "</svg>";
    $("hist").innerHTML = svg;
    $("hist").querySelectorAll(".hb").forEach(function (r) {
      var pick = function () { var i = +r.getAttribute("data-bin"); state.binSel = state.binSel === i ? -1 : i; renderPriceBlock(); };
      r.addEventListener("click", pick);
      r.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    });

    // 定位
    var others = list.filter(function (s) { return true; });
    var pos = "";
    if (state.myPrice && others.length) {
      var lower = others.filter(function (s) { return s.p < state.myPrice; }).length;
      var pct = Math.round(lower / others.length * 100);
      var same = others.filter(function (s) { return binOf(s.p, b) === myBin; }).length;
      var near = others.slice().sort(function (a, c) { return Math.abs(a.p - state.myPrice) - Math.abs(c.p - state.myPrice); })[0];
      pos = '<div><span class="v">' + pct + '%</span><span class="l">样本中比你便宜的 SKU</span></div>' +
        '<div><span class="v">' + same + ' 个</span><span class="l">与你同一价格带（' + binLabel(myBin, b) + " 元）</span></div>" +
        '<div><span class="v">¥' + fmt(near.p) + '</span><span class="l">最接近：' + esc(near.b) + "</span></div>";
    } else {
      pos = '<div><span class="v">—</span><span class="l">填写你的定价后显示分位</span></div><div><span class="v">—</span><span class="l">同价格带竞品数</span></div><div><span class="v">—</span><span class="l">最接近的竞品</span></div>';
    }
    $("position").innerHTML = pos;

    // 列表
    var rows = list.filter(function (s) { return state.binSel < 0 || binOf(s.p, b) === state.binSel; }).sort(function (a, c) { return a.p - c.p; });
    $("sku-head-t").textContent = (state.binSel >= 0 ? binLabel(state.binSel, b) + " 元：" : "全部：") + rows.length + " 个 SKU，按价格从低到高";
    var pills = "";
    if (state.segFilter) pills += '<button class="pill src-ai" style="border:0" data-clear="seg">' + esc(state.segFilter) + " ×</button> ";
    if (state.brandFilter) pills += '<button class="pill src-ai" style="border:0" data-clear="brand">' + esc(state.brandFilter) + " ×</button> ";
    if (state.binSel >= 0) pills += '<button class="pill src-ai" style="border:0" data-clear="bin">' + binLabel(state.binSel, b) + " 元 ×</button>";
    $("filter-pills").innerHTML = pills;
    $("filter-pills").querySelectorAll("[data-clear]").forEach(function (x) {
      x.addEventListener("click", function () {
        var k = x.getAttribute("data-clear");
        if (k === "seg") state.segFilter = null; if (k === "brand") state.brandFilter = null; if (k === "bin") state.binSel = -1;
        renderPriceBlock(); if (state.product.market) { renderSegs(); renderBrands(); }
      });
    });
    $("sku-list").innerHTML = rows.length ? rows.map(function (s) {
      return '<div class="sku-row' + (s.mine ? " mine" : "") + '"><span class="t">' + esc(s.t) + "<small>" + esc(s.b) + (s.sold ? " · 已售" + esc(s.sold) : "") + '</small></span><span class="p">¥' + fmt(s.p) + "</span>" +
        (s.sku ? '<a href="' + jdUrl(s.sku) + '" target="_blank" rel="noopener">看原页 ↗</a>' : '<span class="muted">你添加的</span>') + "</div>";
    }).join("") : '<div class="sku-row"><span class="t muted">这个价格带里还没有商品。</span></div>';
  }

  function renderSegs() {
    var skus = state.product.market.skus, c = {};
    skus.forEach(function (s) { c[s.seg] = (c[s.seg] || 0) + 1; });
    var keys = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; });
    var max = c[keys[0]];
    $("segs").innerHTML = keys.map(function (k) {
      var ps = skus.filter(function (s) { return s.seg === k; }).map(function (s) { return s.p; });
      return '<button type="button" class="hbar" data-seg="' + esc(k) + '" aria-pressed="' + (state.segFilter === k) + '" title="价格 ¥' + fmt(Math.min.apply(null, ps)) + "–¥" + fmt(Math.max.apply(null, ps)) + '">' +
        "<span>" + esc(k) + '</span><span class="track"><span class="fill" style="display:block;width:' + (c[k] / max * 100) + '%"></span></span><span class="c">' + c[k] + "</span></button>";
    }).join("");
    $("segs").querySelectorAll(".hbar").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-seg"); state.segFilter = state.segFilter === k ? null : k; state.binSel = -1;
        renderSegs(); renderPriceBlock();
      });
    });
  }

  function renderBrands() {
    var skus = state.product.market.skus, g = {};
    skus.forEach(function (s) {
      var x = g[s.b] || (g[s.b] = { b: s.b, n: 0, min: Infinity, max: 0, sf: 0 });
      x.n++; x.min = Math.min(x.min, s.p); x.max = Math.max(x.max, s.p); x.sf += s.sf;
    });
    var totalSf = skus.reduce(function (a, s) { return a + s.sf; }, 0) || 1;
    var rows = Object.keys(g).map(function (k) { return g[k]; });
    var key = state.brandSort;
    rows.sort(function (a, b) { return key === "min" ? a.min - b.min : (b[key] - a[key]); });
    var th = function (k, label) { return '<th><button type="button" data-sort="' + k + '"' + (key === k ? ' aria-sort="descending"' : "") + ">" + label + "</button></th>"; };
    $("brands").innerHTML = "<table><thead><tr><th>品牌</th>" + th("n", "SKU 数") + th("min", "价格区间") + th("sf", "展示销量占比") + "</tr></thead><tbody>" +
      rows.map(function (r) {
        return '<tr data-brand="' + esc(r.b) + '"' + (state.brandFilter === r.b ? ' class="sel"' : "") + "><td>" + esc(r.b) + '</td><td class="n">' + r.n + '</td><td class="n">¥' + fmt(r.min) + (r.max > r.min ? "–" + fmt(r.max) : "") +
          '</td><td class="n">' + (r.sf / totalSf * 100).toFixed(1) + "%</td></tr>";
      }).join("") + "</tbody></table>";
    $("brands").querySelectorAll("[data-sort]").forEach(function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); state.brandSort = b.getAttribute("data-sort"); renderBrands(); });
    });
    $("brands").querySelectorAll("tbody tr").forEach(function (tr) {
      tr.addEventListener("click", function () {
        var k = tr.getAttribute("data-brand"); state.brandFilter = state.brandFilter === k ? null : k; state.binSel = -1;
        renderBrands(); renderPriceBlock();
      });
    });
  }

  /* ───────── 03 星图 ───────── */
  var W = 1000, H = 600, L = 60, R = 24, T = 24, B = 54;
  function px(x) { return L + x / 100 * (W - L - R); }
  function py(y) { return T + (1 - y / 100) * (H - T - B); }
  function visible(s) { return state.filters[s.circle] && (!state.ageFilter || s.age === state.ageFilter); }

  function renderMap() {
    var p = state.product;
    $("map-crumbs").innerHTML = p.path.map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("");
    $("map-title").textContent = p.name;
    $("map-tagline").textContent = p.tagline;
    $("custom-notice").hidden = !p.custom;
    var vis = p.scenes.filter(visible);
    var avg = vis.length ? Math.round(vis.reduce(function (a, s) { return a + s.y; }, 0) / vis.length) : 0;
    $("readout").innerHTML =
      '<div><span class="v">' + vis.length + '</span><span class="l">当前场景</span></div>' +
      '<div><span class="v accent">' + vis.filter(isOpp).length + '</span><span class="l">机会区</span></div>' +
      '<div><span class="v">' + avg + '</span><span class="l">平均拥挤度</span></div>';
    renderChips(); renderChart(); renderList(); renderTray();
  }

  function renderChips() {
    var used = {}; state.product.scenes.forEach(function (s) { used[s.circle] = true; });
    $("circle-chips").innerHTML = '<span class="lab">兴趣圈层</span>' + Object.keys(CIRCLES).filter(function (c) { return used[c]; }).map(function (c) {
      return '<button type="button" class="chip" data-c="' + c + '" aria-pressed="' + state.filters[c] + '"><i style="background:' + CIRCLES[c].color + '"></i>' + CIRCLES[c].name + "</button>";
    }).join("");
    $("circle-chips").querySelectorAll(".chip").forEach(function (b) {
      b.addEventListener("click", function () {
        var c = b.getAttribute("data-c");
        var on = Object.keys(state.filters).filter(function (k) { return state.filters[k] && used[k]; });
        if (on.length === 1 && state.filters[c]) return;
        state.filters[c] = !state.filters[c]; renderMap();
      });
    });
    var ages = {}; state.product.scenes.forEach(function (s) { ages[s.age] = (ages[s.age] || 0) + 1; });
    $("age-chips").innerHTML = '<span class="lab">年龄段 ' + src("ai") + "</span>" +
      '<button type="button" class="chip" data-a="" aria-pressed="' + !state.ageFilter + '">全部</button>' +
      AGES.filter(function (a) { return ages[a]; }).map(function (a) {
        return '<button type="button" class="chip" data-a="' + a + '" aria-pressed="' + (state.ageFilter === a || !state.ageFilter) + '">' + a + " 岁 · " + ages[a] + "</button>";
      }).join("");
    $("age-chips").querySelectorAll(".chip").forEach(function (b) {
      b.addEventListener("click", function () { var a = b.getAttribute("data-a"); state.ageFilter = a ? (state.ageFilter === a ? null : a) : null; renderMap(); });
    });
  }

  function renderChart() {
    var scenes = state.product.scenes, s = "";
    [0, 25, 50, 75, 100].forEach(function (v) {
      s += '<line class="grid-line" x1="' + px(v) + '" y1="' + T + '" x2="' + px(v) + '" y2="' + (H - B) + '"/>';
      s += '<line class="grid-line" x1="' + L + '" y1="' + py(v) + '" x2="' + (W - R) + '" y2="' + py(v) + '"/>';
      s += '<text class="tick" x="' + px(v) + '" y="' + (H - B + 18) + '" text-anchor="middle">' + v + "</text>";
      s += '<text class="tick" x="' + (L - 10) + '" y="' + (py(v) + 4) + '" text-anchor="end">' + v + "</text>";
    });
    s += '<rect class="opp-zone" x="' + px(55) + '" y="' + py(45) + '" width="' + (px(100) - px(55)) + '" height="' + (py(0) - py(45)) + '" rx="10"/>';
    s += '<text class="quad-label opp" x="' + (px(100) - 12) + '" y="' + (py(0) - 12) + '" text-anchor="end">机会区 · 需求高 写的人少</text>';
    s += '<text class="quad-label" x="' + (px(100) - 12) + '" y="' + (py(100) + 22) + '" text-anchor="end">红海 · 需求高 但拥挤</text>';
    s += '<text class="quad-label" x="' + (px(0) + 12) + '" y="' + (py(100) + 22) + '">内卷 · 需求低 也拥挤</text>';
    s += '<text class="quad-label" x="' + (px(0) + 12) + '" y="' + (py(0) - 12) + '">小众 · 等待时机</text>';
    s += '<text class="axis-label" x="' + ((L + W - R) / 2) + '" y="' + (H - 10) + '" text-anchor="middle">需求强度（评估）→</text>';
    s += '<text class="axis-label" transform="translate(16 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">内容拥挤度（评估）→</text>';
    Object.keys(CIRCLES).forEach(function (c) {
      if (!state.filters[c]) return;
      var pts = scenes.filter(function (q) { return q.circle === c && visible(q); }).sort(function (a, b) { return a.x - b.x; });
      if (pts.length > 1) s += '<polyline class="const-line" stroke="' + CIRCLES[c].color + '" points="' + pts.map(function (q) { return px(q.x) + "," + py(q.y); }).join(" ") + '"/>';
    });
    scenes.forEach(function (q, i) {
      var r = 5 + q.size * 3.2, col = CIRCLES[q.circle].color, on = visible(q);
      var cls = "star" + (on ? "" : " dim") + (state.picked.indexOf(q.id) > -1 ? " picked" : "");
      s += '<g class="' + cls + '" data-i="' + i + '" tabindex="' + (on ? 0 : -1) + '" role="button" aria-label="' + esc(q.title) + '">' +
        '<circle class="halo" cx="' + px(q.x) + '" cy="' + py(q.y) + '" r="' + (r * 2.3) + '" fill="' + col + '" style="animation-delay:-' + ((i * 0.37) % 3.6).toFixed(2) + 's"/>' +
        '<circle class="ring" cx="' + px(q.x) + '" cy="' + py(q.y) + '" r="' + (r + 6) + '"/>' +
        '<circle class="core" cx="' + px(q.x) + '" cy="' + py(q.y) + '" r="' + r + '" fill="' + col + '"/>' +
        '<text class="num" x="' + (px(q.x) + r + 5) + '" y="' + (py(q.y) - r + 2) + '">' + String(i + 1).padStart(2, "0") + "</text></g>";
    });
    var svg = $("chart"); svg.innerHTML = s;
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
    var wrap = $("chart-wrap").getBoundingClientRect(), b = g.querySelector(".core").getBoundingClientRect();
    tip.innerHTML = "<b>" + esc(q.title) + "</b><span>" + CIRCLES[q.circle].name + " · " + q.age + " 岁 · 需求 " + q.x + " · 拥挤 " + q.y + "</span>";
    tip.hidden = false;
    var left = Math.max(8, Math.min(b.left - wrap.left + b.width / 2 - tip.offsetWidth / 2, wrap.width - tip.offsetWidth - 8));
    var top = b.top - wrap.top - tip.offsetHeight - 10; if (top < 8) top = b.bottom - wrap.top + 10;
    tip.style.left = left + "px"; tip.style.top = top + "px";
  }
  function hideTip() { $("tooltip").hidden = true; }

  function renderList() {
    var scenes = state.product.scenes;
    var order = scenes.map(function (s, i) { return i; }).filter(function (i) { return visible(scenes[i]); })
      .sort(function (a, b) { return oppScore(scenes[b]) - oppScore(scenes[a]); });
    $("scene-list").innerHTML = order.map(function (i) {
      var q = scenes[i];
      return '<button type="button" class="scene-card" data-i="' + i + '"><span class="top"><span>' + catalog(i) + " · " + q.age + " 岁</span>" +
        (isOpp(q) ? '<span class="badge-opp">机会区</span>' : "<span>" + CIRCLES[q.circle].name + "</span>") + "</span><h3>" + esc(q.title) + "</h3>" +
        '<span class="bars"><span>需求</span><span class="bar"><i style="width:' + q.x + '%"></i></span><span>拥挤</span><span class="bar crowd"><i style="width:' + q.y + '%"></i></span></span></button>';
    }).join("") || '<p class="muted">当前筛选下没有场景。</p>';
    $("scene-list").querySelectorAll(".scene-card").forEach(function (b) { b.addEventListener("click", function () { openDrawer(+b.getAttribute("data-i")); }); });
  }
  function setMode(m) {
    state.mode = m;
    $("chart-wrap").hidden = m !== "chart"; $("scene-list").hidden = m !== "list";
    $("mode-chart").setAttribute("aria-pressed", m === "chart"); $("mode-list").setAttribute("aria-pressed", m === "list");
  }
  $("mode-chart").addEventListener("click", function () { setMode("chart"); });
  $("mode-list").addEventListener("click", function () { setMode("list"); });

  /* ───────── 场景抽屉 ───────── */
  var drawerIndex = -1;
  function radarSvg(y) {
    var r = 28, c = 2 * Math.PI * r, col = y >= 65 ? "#ff2442" : y >= 45 ? "#F2994A" : "#22A699";
    return '<svg viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="' + r + '" fill="none" stroke="#f4f4f6" stroke-width="6"/>' +
      '<circle cx="36" cy="36" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + (c * y / 100).toFixed(1) + " " + c.toFixed(1) + '" transform="rotate(-90 36 36)"/>' +
      '<text x="36" y="41" text-anchor="middle" fill="#17171c" font-family="IBM Plex Mono, monospace" font-size="15">' + y + "</text></svg>";
  }
  function coverHtml(q) {
    var sub = { center: "left:18%;right:18%;top:24%;bottom:24%", left: "left:8%;width:46%;top:20%;bottom:16%", "top-left": "left:8%;width:60%;top:8%;height:52%" }[q.cover.layout] || "left:18%;right:18%;top:24%;bottom:24%";
    var band = q.cover.text === "top" ? "top:8px" : "bottom:8px";
    if (q.cover.layout === "top-left" && q.cover.text === "top") band = "bottom:8px";
    return '<div class="cover" aria-hidden="true"><div class="subject" style="' + sub + '">' + esc(q.cover.subject) + '</div><div class="text-band" style="' + band + '">' + esc(q.titles[0]) + "</div></div>";
  }
  function openDrawer(i) {
    hideTip(); drawerIndex = i;
    var q = state.product.scenes[i], c = CIRCLES[q.circle];
    $("d-cat").textContent = catalog(i) + (isOpp(q) ? " · 机会区" : "");
    var ul = function (a) { return "<ul>" + a.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>"; };
    $("d-body").innerHTML =
      '<div><h2 class="d-title" id="d-title">' + esc(q.title) + '</h2><div class="d-tags"><span class="pill" style="background:var(--field)"><i style="width:8px;height:8px;border-radius:50%;background:' + c.color + '"></i>' + c.name + '</span><span class="pill" style="background:var(--field)">' + q.age + " 岁</span>" + src("ai") + "</div></div>" +
      '<div class="metrics"><div><span class="v">' + q.x + '</span><span class="l">需求强度</span></div><div><span class="v">' + q.y + '</span><span class="l">内容拥挤度</span></div><div><span class="v">' + ["", "小", "中", "大"][q.size] + '</span><span class="l">人群规模</span></div></div>' +
      '<div class="block"><h4>那一刻</h4><p class="moment">' + esc(q.moment) + "</p></div>" +
      '<div class="block"><h4>真实痛点</h4>' + ul(q.pains) + "</div>" +
      '<div class="block"><h4>她会这样搜</h4><div class="searchbars">' + q.searches.map(function (t) { return '<div class="searchbar">' + esc(t) + "</div>"; }).join("") + "</div></div>" +
      '<div class="block"><h4>打动她的点</h4>' + ul(q.hooks) + "</div>" +
      '<div class="block"><h4>同质化雷达</h4><div class="radar">' + radarSvg(q.y) + '<div><p class="verdict">' + crowdVerdict(q.y) + "</p>" + ul(q.worn) + "</div></div></div>" +
      '<div class="block"><h4>笔记标题建议</h4><div class="titles">' + q.titles.map(function (t, k) { return '<div class="title-row"><span>' + esc(t) + '</span><button type="button" data-copy="' + k + '">复制</button></div>'; }).join("") + "</div></div>" +
      '<div class="block"><h4>封面构图建议 · 3:4</h4><div class="cover-wrap">' + coverHtml(q) + '<div class="cover-note"><span><b>主体：</b>' + esc(q.cover.subject) + "</span><span>" + esc(q.cover.note) + "</span></div></div></div>";
    $("d-body").querySelectorAll("[data-copy]").forEach(function (b) { b.addEventListener("click", function () { copyText(q.titles[+b.getAttribute("data-copy")], "标题已复制"); }); });
    $("d-body").scrollTop = 0; updatePickBtn();
    $("drawer").classList.add("open"); $("drawer").setAttribute("aria-hidden", "false"); $("scrim").classList.add("open");
    document.querySelectorAll(".star").forEach(function (g) { g.classList.toggle("active", +g.getAttribute("data-i") === i); });
    setTimeout(function () { $("d-close").focus(); }, 50);
  }
  function closeDrawer() {
    if (!$("drawer").classList.contains("open")) return;
    $("drawer").classList.remove("open"); $("drawer").setAttribute("aria-hidden", "true"); $("scrim").classList.remove("open");
    document.querySelectorAll(".star.active").forEach(function (g) { g.classList.remove("active"); });
  }
  function stepDrawer(dir) {
    var scenes = state.product.scenes;
    var vis = scenes.map(function (s, i) { return i; }).filter(function (i) { return visible(scenes[i]); }).sort(function (a, b) { return scenes[a].x - scenes[b].x; });
    if (!vis.length) return;
    var pos = vis.indexOf(drawerIndex); if (pos < 0) pos = 0;
    openDrawer(vis[(pos + dir + vis.length) % vis.length]);
  }
  function updatePickBtn() {
    var q = state.product.scenes[drawerIndex], on = state.picked.indexOf(q.id) > -1, full = !on && state.picked.length >= MAX_PICK, b = $("d-pick");
    b.textContent = on ? "已加入 · 点击移除" : full ? "清单已满（" + MAX_PICK + " 个）" : "加入策展清单";
    b.disabled = full; b.classList.toggle("btn-primary", !on);
  }
  $("d-pick").addEventListener("click", function () {
    var q = state.product.scenes[drawerIndex], k = state.picked.indexOf(q.id);
    if (k > -1) { state.picked.splice(k, 1); toast("已从清单移除"); }
    else if (state.picked.length < MAX_PICK) { state.picked.push(q.id); toast("已加入策展清单（" + state.picked.length + "/" + MAX_PICK + "）"); }
    updatePickBtn(); renderChart();
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

  function renderTray() {
    var n = state.picked.length, slots = "";
    for (var i = 0; i < MAX_PICK; i++) slots += '<span class="slot' + (i < n ? " on" : "") + '"></span>';
    $("tray-picked").innerHTML = slots + "<span>" + (n ? "已选 " + n + " 个场景" : "点开星星，把想打的场景加入清单") + "</span>";
    $("tray-go").disabled = n === 0; $("step-plan").disabled = n === 0;
  }
  $("tray-go").addEventListener("click", function () { go("plan"); });

  /* ───────── 04 策划 ───────── */
  function pickedScenes() {
    var scenes = state.product.scenes;
    return state.picked.map(function (id) { for (var i = 0; i < scenes.length; i++) if (scenes[i].id === id) return { s: scenes[i], i: i }; })
      .filter(Boolean).sort(function (a, b) { return oppScore(b.s) - oppScore(a.s); });
  }
  function positioning() {
    var all = allSkus().filter(function (s) { return !s.mine; }).concat(state.comps);
    if (!state.myPrice || !all.length) return null;
    var b = bins(), lower = all.filter(function (s) { return s.p < state.myPrice; }).length;
    var mb = binOf(state.myPrice, b);
    return { pct: Math.round(lower / all.length * 100), band: binLabel(mb, b), same: all.filter(function (s) { return binOf(s.p, b) === mb; }).length, n: all.length };
  }
  function today() { var d = new Date(); return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0"); }

  function renderPlan() {
    var root = $("plan-root");
    if (!state.product || !state.picked.length) {
      root.innerHTML = '<div class="empty"><p>清单还是空的。回到星图，点开星星，把想打的场景加入清单。</p></div>';
      $("plan-copy").disabled = true; return;
    }
    $("plan-copy").disabled = false;
    var items = pickedScenes(), pos = positioning();
    var circles = {}; items.forEach(function (it) { circles[it.s.circle] = 1; });
    var h = '<article class="sheet"><header class="sheet-head"><div><p class="eyebrow">本周种草策划 · ' + esc(state.product.path.join(" › ")) + "</p>" +
      "<h1>" + esc(state.product.name) + "：" + items.length + " 个被需要的瞬间</h1>" +
      '<p class="sub">' + esc(state.product.tagline) + (state.myPrice ? " · 定价 ¥" + fmt(state.myPrice) : "") + "</p></div>" +
      '<div class="issue">生成于 ' + today() + "<br>按机会分排序</div></header>" +
      '<div class="sheet-intro"><div><span class="v">' + items.length + '</span><span class="l">篇笔记</span></div>' +
      '<div><span class="v">' + items.filter(function (it) { return isOpp(it.s); }).length + '</span><span class="l">来自机会区</span></div>' +
      '<div><span class="v">' + Object.keys(circles).length + '</span><span class="l">覆盖兴趣圈层</span></div>' +
      '<div><span class="v">' + (pos ? pos.pct + "%" : "—") + '</span><span class="l">' + (pos ? "样本中比你便宜的 SKU" : "未填写定价") + "</span></div></div>";
    if (pos) h += '<p class="notice">' + src("jd") + "你的定价落在 " + pos.band + " 元价格带，这一带有 " + pos.same + " 个样本竞品（样本共 " + pos.n + " 个）。笔记里建议把这个价格带里竞品不常讲的场景放在前面。</p>";
    items.forEach(function (it, k) {
      var q = it.s, a = advice(q);
      h += '<section class="entry"><div class="day">' + DAYS[k] + "<small>" + catalog(it.i) + "</small></div>" +
        "<div><h3>" + esc(q.title) + '</h3><p class="who">' + CIRCLES[q.circle].name + " · " + q.age + " 岁 · 需求 " + q.x + " · 拥挤 " + q.y + "</p>" +
        '<p class="headline">' + esc(q.titles[0]) + '</p><div class="kw">' + q.searches.slice(0, 3).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div></div>" +
        '<dl><div><dt>发布建议</dt><dd><span class="' + (a.opp ? "tag-opp" : "") + '">' + a.tag + "</span> · " + a.text + "</dd></div>" +
        "<div><dt>打动点</dt><dd>" + esc(q.hooks[0]) + "</dd></div><div><dt>封面</dt><dd>" + esc(q.cover.subject) + "。" + esc(q.cover.note) + "</dd></div></dl></section>";
    });
    h += '<footer class="sheet-foot"><span>场景分数为 AI 评估；价格定位基于京东实采样本（2026-10-10）。</span><span>一物千景</span></footer></article>';
    root.innerHTML = h;
  }
  function planText() {
    var items = pickedScenes(), pos = positioning();
    var out = ["【" + state.product.name + " · 本周种草策划】", state.product.tagline + (state.myPrice ? " · 定价 ¥" + fmt(state.myPrice) : "")];
    if (pos) out.push("价格定位：" + pos.band + " 元价格带，样本中 " + pos.pct + "% 的 SKU 比你便宜（京东实采样本 " + pos.n + " 个，2026-10-10）");
    out.push("");
    items.forEach(function (it, k) {
      var q = it.s, a = advice(q);
      out.push(DAYS[k] + "｜" + q.title + "（" + CIRCLES[q.circle].name + "，" + q.age + " 岁）");
      out.push("首选标题：" + q.titles[0]); out.push("备选标题：" + q.titles.slice(1).join(" / "));
      out.push("核心搜索词：" + q.searches.join("、")); out.push("打动点：" + q.hooks.join("；"));
      out.push("封面：" + q.cover.subject + "。" + q.cover.note); out.push("发布建议：" + a.tag + "，" + a.text); out.push("");
    });
    out.push("（场景分数为 AI 评估，不是统计数据）");
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
      var ok = false; try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta); toast(ok ? msg : "复制失败，请手动选择文字复制");
    }
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fallback); else fallback(); }
    catch (e) { fallback(); }
  }
  var toastTimer;
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }

  document.querySelectorAll("[data-go]").forEach(function (b) { b.addEventListener("click", function () { if (!b.disabled) go(b.getAttribute("data-go")); }); });
  $("brand").addEventListener("click", function () { go("home"); });
  if (window.matchMedia && window.matchMedia("(max-width: 560px)").matches) setMode("list");
  renderSamples();
  go("home");
})();
