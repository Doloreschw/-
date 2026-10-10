"""把 jd_raw.py 的采集记录和有出处的机构数据，生成前端用的 src/market.js。用法：python3 data/build_market.py"""
import json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from jd_raw import CUP, CANDLE, COFFEE, TOTE

BRAND = [  # (店铺名关键词, 品牌显示名)
 ("蕉下","蕉下"),("炊大皇","炊大皇"),("WEDGWOOD","Wedgwood"),("象印","象印"),("京东京造","京东京造"),("富光","富光"),
 ("STANLEY","Stanley"),("BABLOV","BABLOV"),("小米","米家"),("卡罗特","卡罗特"),("名创优品","名创优品"),("物生物","物生物"),
 ("北鼎","北鼎"),("特美刻","特美刻"),("Tiger","虎牌"),("Tagi","Tagi."),("星巴克","星巴克"),("慕咖","慕咖"),("野兽派","野兽派"),
 ("膳魔师","膳魔师"),("M STAND","M Stand"),("小罐茶","小罐茶"),
 ("无印良品","无印良品"),("THEBEAST","野兽派"),("THE BEAST","野兽派"),("MaisonMargiela","梅森马吉拉"),("Jo Malone","祖玛珑"),
 ("Cosmic","宇宙的猜想"),("Lavas","Lavas"),("观夏","观夏"),("diptyque","蒂普提克"),("LOEWE","罗意威"),("Songmont","Songmont"),
 ("woodwick","WoodWick"),("宋朝","宋朝"),("TRUDON","楚敦"),("Jupiter","Jupiter & Venus"),("大英博物馆","大英博物馆"),("101HOME","京东101HOME"),
 ("摩可纳","摩可纳"),("AGF","AGF"),("雀巢","雀巢"),("花田萃","花田萃"),("悠诗诗","悠诗诗UCC"),("大卫杜夫","大卫杜夫"),("Waitrose","Waitrose"),
 ("永璞","永璞"),("咖皮","咖皮"),("连咖啡","连咖啡"),("铭氏","铭氏"),
 ("纽芝兰","纽芝兰"),("NUCELLE","纽芝兰"),("ECODAY","ECODAY"),("COACH","蔻驰"),("LONGCHAMP","珑骧"),("longchamp","珑骧"),("拉菲斯汀","拉菲斯汀"),
 ("Teenie","Teenie Weenie"),("FURLA","芙拉"),("Lee","Lee"),("CASSILE","卡思乐"),("lululemon","lululemon"),("ROSYDOEDIAN","ROSYDOEDIAN"),
 ("tomtoc","tomtoc"),("KANGOL","KANGOL"),("蔻一","蔻一"),("热风","热风"),("Champion","Champion"),("北面","北面"),("汤丽柏琦","汤丽柏琦"),
 ("TOUTOU","toutou"),("UR","UR"),("MCM","MCM"),("MichaelKors","Michael Kors"),("UNICARE","UNICARE"),("TERRAINCOGNITA","TERRAINCOGNITA"),
 ("15mins","15MINS"),("耐克","耐克"),
]
def brand(shop, title):
    if shop == "1号会员店":
        return title.split("三大")[0].split("F5")[0].strip()[:6] or "其他"
    if shop == "饮品折扣京东自营专区":
        return "星巴克"
    for k, v in BRAND:
        if k in shop:
            return v
    return shop[:8]

def seg_cup(t):
    for k, v in [("儿童","儿童杯"),("钛","钛杯"),("吸管","吸管/冰霸杯"),("冰霸","吸管/冰霸杯"),("陶瓷","陶瓷内胆"),
                 ("茶","茶水分离/泡茶"),("咖啡","咖啡随行杯"),("随行","咖啡随行杯")]:
        if k in t: return v
    return "常规保温杯"
def seg_candle(t):
    if "礼盒" in t: return "礼盒装"
    m = re.findall(r"(\d+)g", t)
    if "迷你" in t or (m and int(m[0]) <= 65): return "迷你装（≤65g）"
    if m and int(m[0]) >= 170: return "大容量（≥170g）"
    return "单只常规装"
def seg_coffee(t):
    if any(k in t for k in ["风味","黄油","焦糖","香草","薄荷"]): return "风味冻干"
    if any(k in t for k in ["条","颗","杯"]): return "小条/小罐便携装"
    return "罐装/大包装"
TOTE_LUX = {"蔻驰","珑骧","芙拉","汤丽柏琦","MCM","Michael Kors"}
TOTE_SPORT = {"lululemon","Champion","北面","耐克","KANGOL","蕉下"}
def seg_tote_brand(b):
    if b in TOTE_LUX: return "国际轻奢品牌"
    if b in TOTE_SPORT: return "运动户外品牌"
    return "国内及其他品牌"

def sold_floor(s):
    if not s: return 0
    m = re.match(r"([\d.]+)(万)?", s)
    if not m: return 0
    v = float(m.group(1)) * (10000 if m.group(2) else 1)
    return int(v)

def pack(rows, segf, by_brand=False):
    out = []
    for sku, title, price, sold, shop in rows:
        b = brand(shop, title)
        out.append({"sku": sku, "t": title, "p": price, "sold": sold, "sf": sold_floor(sold),
                    "b": b, "seg": segf(b) if by_brand else segf(title), "shop": shop})
    return out

JD_NOTE = "京东搜索页，2026-10-10 晚采集；取首屏及下拉加载的非广告商品，已剔除二手、标题缺失和代购店铺。价格为搜索页展示价，可能含促销；登录账号下排序带个性化。"

MARKET = {
 "cup": {
  "path": ["家居日用", "杯壶水具", "保温杯"],
  "bins": [0,50,80,100,130,160,200,250,300,400],
  "skus": pack(CUP, seg_cup),
  "size": {"title": "中国杯壶市场规模", "unit": "亿元", "points": [{"y": "2021", "v": 326}],
           "src": "华经产业研究院（36氪转引）", "url": "https://www.36kr.com/p/2818084401220100"},
  "facts": [
    {"k": "保温杯在杯壶市场中的占比", "v": "超过 50%", "yr": "2021", "src": "华经产业研究院（36氪转引）", "url": "https://www.36kr.com/p/2818084401220100"},
    {"k": "中国保温杯产量年复合增长率", "v": "5.9%", "yr": "2017–2021", "src": "华经产业研究院（36氪转引）", "url": "https://www.36kr.com/p/2818084401220100"},
    {"k": "杯壶市场前三名合计份额（CR3）", "v": "13.1%", "yr": "2021", "src": "国盛证券（36氪转引）", "url": "https://www.36kr.com/p/2818084401220100"},
    {"k": "不锈钢保温杯 高 / 中 / 低端销售额占比", "v": "7% / 32% / 61%", "yr": "原文未注明", "src": "艾瑞咨询（36氪转引）", "url": "https://www.36kr.com/p/2818084401220100"},
    {"k": "全球不锈钢保温杯由中国生产的比例", "v": "约 65%", "yr": "原文未注明", "src": "艾瑞咨询（36氪转引）", "url": "https://www.36kr.com/p/2818084401220100"},
    {"k": "哈尔斯海外营收及占比", "v": "近 29 亿元，87.06%", "yr": "2024", "src": "哈尔斯 2024 年业绩报告（界面新闻转引）", "url": "https://www.jiemian.com/article/12928497.html"},
  ],
  "share_note": "公开数据只到杯壶整体的集中度：前三名合计 13.1%（2021，国盛证券），说明市场分散、新品牌仍有空间。品牌级份额暂无可靠公开数据。",
  "age": [],
 },
 "candle": {
  "path": ["家居日用", "家居香氛", "香薰蜡烛"],
  "bins": [0,50,100,150,200,250,300,400,500,700],
  "skus": pack(CANDLE, seg_candle),
  "size": {"title": "中国家居香氛市场规模", "unit": "亿元", "points": [{"y": "2023", "v": 86.78}],
           "growth": "同比 +15.26%", "src": "智研咨询", "url": "https://www.chyxx.com/industry/1206814.html"},
  "facts": [
    {"k": "家居香氛市场规模", "v": "约 86.78 亿元，同比 +15.26%", "yr": "2023", "src": "智研咨询", "url": "https://www.chyxx.com/industry/1206814.html"},
    {"k": "竞争格局", "v": "Diptyque、祖玛珑等外资品牌占较大比重；气味图书馆、野兽派等国货跨界品牌拥有用户基础", "yr": "2024 年发布", "src": "智研咨询", "url": "https://www.chyxx.com/industry/1206814.html"},
  ],
  "share_note": "机构只给出定性判断：外资品牌占较大比重（智研咨询）。具体份额暂无可靠公开数据。",
  "age": [{"txt": "80 后、90 后、00 后已成为家居香氛的主要消费群体", "src": "智研咨询", "url": "https://www.chyxx.com/industry/1206814.html"}],
 },
 "tote": {
  "path": ["服饰箱包", "女包", "托特包"],
  "bins": [0,150,200,250,300,400,600,1000,1500,4000],
  "skus": pack(TOTE, seg_tote_brand, by_brand=True),
  "size": {"title": "中国女包市场规模（托特包无单独公开数据）", "unit": "亿元",
           "points": [{"y": "2017", "v": 900}, {"y": "2022", "v": 1204}, {"y": "2023E", "v": 1290, "e": True}],
           "src": "观研天下", "url": "https://www.chinabaogao.com/free/202310/667695.html"},
  "facts": [
    {"k": "女包市场规模", "v": "900 亿元 → 1204 亿元", "yr": "2017 → 2022", "src": "观研天下", "url": "https://www.chinabaogao.com/free/202310/667695.html"},
    {"k": "复合材料女包 / 真皮女包市场规模", "v": "753.15 亿元 / 393.2 亿元", "yr": "2021", "src": "观研天下", "url": "https://www.chinabaogao.com/free/202310/667695.html"},
    {"k": "国内品牌女包价格", "v": "大多在 500 元以下", "yr": "2023 年发布", "src": "观研天下", "url": "https://www.chinabaogao.com/free/202310/667695.html"},
  ],
  "share_note": "托特包这一细分没有找到可靠的市场规模或品牌份额公开数据。",
  "age": [],
 },
 "coffee": {
  "path": ["食品饮料", "咖啡", "速溶咖啡", "冻干咖啡"],
  "bins": [0,15,25,35,45,60,80,120,200],
  "skus": pack(COFFEE, seg_coffee),
  "size": {"title": "中国速溶咖啡市场规模（冻干无单独公开数据）", "unit": "亿元",
           "points": [{"y": "2022", "v": 418}, {"y": "2024", "v": 680}, {"y": "2026E", "v": 1099, "e": True}],
           "src": "艾媒咨询", "url": "https://report.iimedia.cn/tag/%E9%80%9F%E6%BA%B6%E5%92%96%E5%95%A1",
           "alt": "口径差异：观研天下给出的 2022 年速溶咖啡规模为 720 亿元。"},
  "facts": [
    {"k": "精品速溶 / 传统速溶品牌份额", "v": "约 19% / 约 75.4%", "yr": "原文未注明", "src": "观研天下", "url": "https://www.chinabaogao.com/baogao/202305/635620.html"},
    {"k": "冻干速溶、咖啡浓缩液等新消费咖啡线上销售额", "v": "约 20 亿元（估算）", "yr": "2021", "src": "第一财经 YiMagazine 估算（界面新闻转引）", "url": "https://www.jiemian.com/article/7352386.html"},
    {"k": "购买速溶咖啡的前三考量", "v": "口味 47.79%、价格 40.65%、保质期 39.92%", "yr": "2025 调查", "src": "艾媒咨询", "url": "https://report.iimedia.cn/tag/%E9%80%9F%E6%BA%B6%E5%92%96%E5%95%A1"},
    {"k": "速溶咖啡饮用频率最高的一档", "v": "每周 4–6 次，占 36.24%", "yr": "2025 调查", "src": "艾媒咨询", "url": "https://report.iimedia.cn/tag/%E9%80%9F%E6%BA%B6%E5%92%96%E5%95%A1"},
  ],
  "share_note": "精品速溶约占 19%、传统速溶品牌约 75.4%（观研天下，年份未标注）。三顿半等品牌的具体份额暂无可靠公开数据；三顿半未出现在本次京东样本中。",
  "age": [{"txt": "精品速溶的主力人群被描述为高学历、高收入、高消费的年轻群体，原文未给出具体年龄段", "src": "艾媒咨询 CEO 张毅（界面新闻转引）", "url": "https://www.jiemian.com/article/7352386.html"}],
 },
}

PLATFORM = {
  "title": "小红书月活用户结构",
  "bars": [{"k": "95 后", "v": 50}, {"k": "00 后", "v": 35}],
  "extra": "男女比例约 3:7；一二线城市用户占比近半",
  "src": "千瓜《2024「活跃用户」研究报告（小红书平台）》（界面新闻转引）",
  "url": "https://www.jiemian.com/article/11499491.html",
  "note": "95 后与 00 后两组有重叠口径，不能相加。"
}

SCENE_AGE = {
 "cup1":"25-30","cup2":"31-40","cup3":"18-24","cup4":"25-30","cup5":"18-24","cup6":"25-30","cup7":"31-40","cup8":"25-30","cup9":"25-30","cup10":"25-30","cup11":"31-40","cup12":"18-24",
 "cd1":"25-30","cd2":"25-30","cd3":"18-24","cd4":"25-30","cd5":"25-30","cd6":"25-30","cd7":"31-40","cd8":"25-30","cd9":"31-40","cd10":"31-40","cd11":"31-40","cd12":"25-30",
 "tt1":"25-30","tt2":"18-24","tt3":"18-24","tt4":"31-40","tt5":"25-30","tt6":"18-24","tt7":"31-40","tt8":"25-30","tt9":"25-30","tt10":"25-30","tt11":"31-40","tt12":"18-24",
 "cf1":"18-24","cf2":"31-40","cf3":"25-30","cf4":"25-30","cf5":"31-40","cf6":"25-30","cf7":"25-30","cf8":"18-24","cf9":"31-40","cf10":"18-24","cf11":"25-30","cf12":"18-24",
}

root = Path(__file__).resolve().parent.parent
js = ("/* 一物千景 · 品类市场数据（由 data/build_market.py 生成，请勿手改）\n"
      " * 机构数据均附来源链接；SKU 价格来自京东搜索页实采。 */\n"
      f"window.JD_NOTE = {json.dumps(JD_NOTE, ensure_ascii=False)};\n"
      f"window.MARKET = {json.dumps(MARKET, ensure_ascii=False, indent=1)};\n"
      f"window.PLATFORM = {json.dumps(PLATFORM, ensure_ascii=False, indent=1)};\n"
      f"window.SCENE_AGE = {json.dumps(SCENE_AGE, ensure_ascii=False)};\n")
(root / "src" / "market.js").write_text(js, encoding="utf-8")
for k, v in MARKET.items():
    segs = {}
    for s in v["skus"]: segs[s["seg"]] = segs.get(s["seg"], 0) + 1
    ps = sorted(s["p"] for s in v["skus"])
    print(k, len(v["skus"]), "price", ps[0], "-", ps[-1], segs)
