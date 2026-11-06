(function () {
  var $ = function (s) { return document.querySelector(s); };
  var view = $("#view");
  var BANDS = [["10대", 10, 19], ["20대", 20, 29], ["30대", 30, 39], ["40대", 40, 49], ["50대", 50, 59], ["60대", 60, 69], ["70대 이상", 70, 120]];
  var HH = [["1인", "혼자 살아요"], ["부부", "부부 둘이 살아요"], ["자녀", "미성년 자녀가 있어요"], ["한부모", "한부모 가정이에요"], ["조부모돌봄", "부모님·조부모를 돌봐요"]];
  /* 기준 중위소득 구간: 1=0~50% 2=51~75% 3=76~100% 4=101% 이상 */
  var INCOMES = [["1", "생활이 어려운 편 (기준 중위소득 50% 이하 정도)"], ["2", "넉넉하지 않은 편 (75% 이하 정도)"], ["3", "보통 (100% 이하 정도)"], ["4", "여유 있는 편 (100% 초과)"], ["unknown", "잘 모르겠어요"]];
  var ATTRS = [["장애", "장애가 있어요 (본인 또는 가족)"], ["보훈", "국가유공자·보훈 대상이에요"], ["농어업", "농업·어업·축산업에 종사해요"], ["구직", "구직 중이에요"], ["임신출산", "임신·출산·영유아 양육 중이에요"], ["학생", "학생이에요"], ["질병", "질병 치료 중이거나 돌봄이 필요해요"]];
  var SPECIAL_ATTR = { "농업": "농어업", "장애": "장애", "보훈": "보훈" };
  var SRC = { central: "중앙부처", local: "지자체", edu: "교육청" };
  var PAGE = 30;

  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var S = { tab: "home", cat: "전체", src: "central", q: "", limit: PAGE, profile: null, saved: load("saved2", []), alarm: load("alarm", { d7: true, d1: true, fresh: true }) };
  var DB = { index: null, list: [], byId: {}, loaded: {}, error: "" };

  /* 프로필: 첫 프로필("나")은 무료. 부모님·배우자 같은 가족 프로필은 추가할 때 보상형 광고를 한 번 본다(config.json 의 family 로 끌 수 있다) */
  function loadProfiles() {
    var ps = load("profiles3", null);
    if (ps && ps.list) return ps;
    var p2 = load("profile2", null);   /* 예전에 하나만 저장하던 값을 가져온다 */
    if (p2) { p2.id = "me"; p2.name = "나"; return { list: [p2], active: "me" }; }
    return { list: [], active: "" };
  }
  var PF = loadProfiles();
  function savePF() { save("profiles3", PF); }
  function activeP() { return PF.list.filter(function (x) { return x.id === PF.active; })[0] || PF.list[0] || null; }
  function setActive(id) { PF.active = id; savePF(); S.profile = activeP(); }
  S.profile = activeP();

  /* 앱 설정(config.json): 앱에 든 기본값 위에 인터넷의 최신 파일을 덮어쓴다. 인터넷이 안 되면 마지막으로 받은 값을 쓴다 */
  var CFG = { splash: { minMs: 1800 }, debug: { rewardedTest: false }, family: { enabled: true, maxProfiles: 5, adToAdd: true }, ads: { enabled: true, provider: "admob", fallback: "admob", meta: { test: false, testDevices: [], android: { banner: "", interstitial: "", rewarded: "" }, ios: { banner: "", interstitial: "", rewarded: "" } }, banner: false, interstitial: { enabled: true, everyViews: 1, minGapSec: 600, firstDelaySec: 90, afterAppOpenSec: 90, dailyMax: 5, delayMs: 800 }, appOpen: { enabled: true, gapMin: 240, skipFirstLaunch: true, resumeAfterMin: 30 } }, insurance: { enabled: true, title: "내보험찾기", url: "", mode: "inapp" } };
  function deepMerge(dst, src) {
    for (var k in src) {
      var v = src[k];
      if (v && typeof v === "object" && !Array.isArray(v) && dst[k] && typeof dst[k] === "object" && !Array.isArray(dst[k])) deepMerge(dst[k], v); else dst[k] = v;
    }
  }
  function mergeCfg(o) {
    if (!o) return;
    ["ads", "insurance", "debug", "family", "splash"].forEach(function (g) { if (o[g]) deepMerge(CFG[g], o[g]); });
  }
  function withTimeout(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, ms); })]); }
  function loadConfig() {
    var local = fetch("config.json").then(function (r) { return r.json(); }).catch(function () { return null; });
    var cached = load("cfg_remote", null);
    var remote = (typeof CONFIG_URL === "string" && CONFIG_URL)
      ? withTimeout(fetch(CONFIG_URL + "?t=" + Date.now()).then(function (r) { if (!r.ok) throw new Error("cfg"); return r.json(); }), 3000)
          .then(function (j) { save("cfg_remote", j); return j; }).catch(function () { return cached; })
      : Promise.resolve(cached);
    return Promise.all([local, remote]).then(function (a) { mergeCfg(a[0]); mergeCfg(a[1]); });
  }
  /* 상태바를 숨긴 화면에서 위쪽에 공백을 둔다(카메라 구멍·상태바 높이, 최소 28px) */
  function setTopSpace() {
    var d = document.createElement("div");
    d.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;padding-top:max(env(safe-area-inset-top,0px),var(--safe-area-inset-top,0px))";
    document.body.appendChild(d);
    var v = parseFloat(getComputedStyle(d).paddingTop) || 0;
    document.body.removeChild(d);
    document.documentElement.style.setProperty("--stb", Math.max(v, window.Ads && Ads.native ? 28 : 0) + "px");
  }
  function applyConfig() {
    setTopSpace();
    if (window.Ads) {
      Ads.setProvider(CFG.ads.provider, CFG.ads.meta, CFG.ads.fallback, CFG.ads.enabled);
      Ads.setInterstitial(CFG.ads.interstitial);
      Ads.setAppOpen(CFG.ads.appOpen, function () { return $("#sheet").classList.contains("hidden") && $("#onboard").classList.contains("hidden"); });
    }
    var t = $("#insTab"), I = CFG.insurance;
    if (t) { t.classList.toggle("hidden", !(I.enabled && I.url)); t.innerHTML = '<i>🛡️</i>' + esc(I.title || "내보험찾기"); }
    BANNER = !(window.Ads && Ads.native) && CFG.ads.banner ? '<div class="banner">배너 광고 영역 (시연)</div>' : "";
  }
  /* 내보험찾기: 설정의 주소를 설정한 방식으로 연다(inapp=앱 안, external=바깥 브라우저) */
  function openInsurance() {
    var I = CFG.insurance; if (!I.url) return;
    var B = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Browser;
    if (window.Ads && Ads.native) {
      if (I.mode === "external") window.open(I.url, "_system");
      else if (B) B.open({ url: I.url }).catch(function () { window.open(I.url, "_system"); });
      else window.open(I.url, "_blank");
    } else window.open(I.url, "_blank");
  }

  function openLink(url) {
    var B = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Browser;
    if (window.Ads && Ads.native && B) B.open({ url: url }).catch(function () {}); else window.open(url, "_blank");
  }
  /* 앱 안 알림창: 폰 기본 알림창(alert/confirm) 대신 쓴다. 뒤로가기·바깥 눌러 닫기는 "취소"로 처리 */
  var dlgResolve = null;
  function dlg(msg, confirmMode, okLabel, noLabel) {
    return new Promise(function (resolve) {
      var d = $("#dlg");
      if (!d) { d = document.createElement("div"); d.id = "dlg"; d.className = "dlg hidden"; document.body.appendChild(d); }
      d.innerHTML = '<div class="box" role="dialog"><p class="msg">' + esc(msg) + '</p><div class="row">' + (confirmMode ? '<button class="btn sec sm" id="dlgNo">' + esc(noLabel || "취소") + '</button>' : "") + '<button class="btn sm" id="dlgOk">' + esc(okLabel || "확인") + '</button></div></div>';
      d.classList.remove("hidden");
      var done = function (v) { d.classList.add("hidden"); dlgResolve = null; resolve(v); };
      dlgResolve = done;
      $("#dlgOk").onclick = function () { done(true); };
      var no = $("#dlgNo"); if (no) no.onclick = function () { done(false); };
      d.onclick = function (e) { if (e.target === d) done(false); };
    });
  }
  /* 앱 안 선택 창: 폰 기본 선택 팝업(<select>) 대신 쓴다. 고르면 그 값, 취소·뒤로가기·바깥 누르기는 null */
  function pickIn(title, options, current) {
    return new Promise(function (resolve) {
      var d = $("#dlg");
      if (!d) { d = document.createElement("div"); d.id = "dlg"; d.className = "dlg hidden"; document.body.appendChild(d); }
      d.innerHTML = '<div class="box" role="dialog"><p class="msg" style="margin-bottom:10px;font-weight:700">' + esc(title) + '</p><div class="pick">' +
        options.map(function (o, i) { return '<button class="opt' + (o === current ? " on" : "") + '" data-i="' + i + '">' + esc(o) + '</button>'; }).join("") +
        '</div><div class="row" style="margin-top:12px"><button class="btn sec sm" id="dlgNo">취소</button></div></div>';
      d.classList.remove("hidden");
      var done = function (v) { d.classList.add("hidden"); dlgResolve = null; resolve(v); };
      dlgResolve = function () { done(null); };
      Array.prototype.forEach.call(d.querySelectorAll(".pick .opt"), function (b) { b.onclick = function () { done(options[+b.dataset.i]); }; });
      $("#dlgNo").onclick = function () { done(null); };
      d.onclick = function (e) { if (e.target === d) done(null); };
      var on = d.querySelector(".pick .on"); if (on && on.scrollIntoView) on.scrollIntoView({ block: "center" });
    });
  }
  function alertIn(msg) { return dlg(msg, false); }
  function confirmIn(msg, okLabel, noLabel) { return dlg(msg, true, okLabel, noLabel); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function clean(s) { return String(s == null ? "" : s).replace(/\s*\|\|\s*/g, ", "); }   /* 원본 데이터의 여러 값 구분 기호(||)를 쉼표로 */
  function fmtDate(s) { s = String(s || ""); return s.length >= 8 && s.indexOf("-") < 0 ? s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) : s; }
  function dday(p) {
    if (p.deadline === "상시") return null;
    return Math.round((new Date(p.deadline) - new Date(TODAY)) / 86400000);
  }
  function ddayLabel(p) { var d = dday(p); return d === null ? "상시" : d === 0 ? "오늘 마감" : "D-" + d; }

  /* ---------- 데이터 불러오기 ---------- */
  function addPolicies(arr) {
    arr.forEach(function (p) { if (p.deadline !== "상시" && p.deadline < TODAY) return; if (!DB.byId[p.id]) { DB.byId[p.id] = p; DB.list.push(p); } });
  }
  function fetchJson(name) { return fetch(DATA_BASE + name).then(function (r) { if (!r.ok) throw new Error(name); return r.json(); }); }
  function loadRegion(region) {
    if (!region || region === "전국" || DB.loaded[region]) return Promise.resolve();
    var f = DB.index && DB.index.files[region];
    if (!f) return Promise.resolve();
    return fetchJson(f.file).then(function (arr) { DB.loaded[region] = true; addPolicies(arr); });
  }
  function initData() {
    view.innerHTML = '<div class="empty">정책 데이터를 불러오는 중…</div>';
    return fetchJson("index.json").then(function (idx) {
      DB.index = idx;
      return fetchJson(idx.files["전국"].file);
    }).then(function (arr) { addPolicies(arr); DB.loaded["전국"] = true; return loadRegion(S.profile && S.profile.region); })
      .catch(function () { DB.error = "정책 데이터를 불러오지 못했어요. 인터넷 연결을 확인해 주세요."; });
  }
  function init() { return Promise.all([loadConfig(), initData()]).then(applyConfig); }
  function subsOf(region) {
    var set = {};
    DB.list.forEach(function (p) { if (p.region === region && p.sub) set[p.sub] = 1; });
    return ["전체"].concat(Object.keys(set).sort());
  }

  /* ---------- 매칭: "받을 수 있음"이 아니라 "조건이 맞을 가능성"만 말한다 ---------- */
  function match(p) {
    var u = S.profile;
    if (!u) return { score: 0, level: "none", reasons: [] };
    var b = BANDS.filter(function (x) { return x[0] === u.age; })[0];
    if (b[2] < p.ageMin || b[1] > p.ageMax) return null;
    if (p.region !== "전국") {
      if (p.region !== u.region) return null;
      if (p.sub ? p.sub !== u.sub : false) return null;
    }
    var has = function (g) { return (u.attrs || []).indexOf(g) >= 0 || (g === "학생" && u.hh.indexOf("자녀") >= 0); };
    if (p.special) { var sa = SPECIAL_ATTR[p.special]; if (!sa || !has(sa)) return null; }
    var score = 0, reasons = [], uncertain = false;
    if (p.tg && p.tg.length) {
      if (!p.tg.some(has)) return null;
      score += 2; reasons.push("해당 대상");
    }
    if (p.ageMin > 0 || p.ageMax < 120) { score += 1; reasons.push("나이대 일치"); }
    if (p.hh.length) {
      var need = p.hh.every(function (h) { return u.hh.indexOf(h) >= 0 || (h === "자녀" && u.hh.indexOf("한부모") >= 0); });
      if (!need) return null;
      score += 2; reasons.push("가구 형태 일치");
    }
    if (p.inc) {
      if (u.income === "unknown") uncertain = true;
      else {
        var n = +u.income;
        if (p.inc.indexOf(n) < 0 && !(n === 4 && p.inc.indexOf(5) >= 0)) return null;
        score += 2; reasons.push("소득 구간 일치");
      }
    }
    if (u.cats.indexOf(p.cat) >= 0) { score += 1; reasons.push("관심 분야"); }
    if (p.region !== "전국") { score += 1; reasons.push("내 지역"); }
    return { score: score, level: uncertain ? "check" : (score >= 2 ? "high" : "mid"), reasons: reasons };
  }
  function matched() {
    return DB.list.map(function (p) { return { p: p, m: match(p) }; })
      .filter(function (x) { return x.m; })
      .sort(function (a, b) { return b.m.score - a.m.score || b.p.views - a.p.views; });
  }

  function card(p, m) {
    var d = dday(p);
    var lv = m && m.level === "high" ? '<span class="tag ok">조건 맞을 가능성 높음</span>' : m && m.level === "check" ? '<span class="tag">소득 확인 필요</span>' : "";
    return '<button class="card" data-id="' + esc(p.id) + '"><span class="t">' + esc(p.title) + '</span><span class="s">' + esc(p.summary) + '</span>' +
      '<span class="row"><span class="tag' + (d !== null && d <= 14 ? " d" : "") + '">' + ddayLabel(p) + '</span><span class="tag">' + SRC[p.src] + '</span>' + lv +
      '<span class="meta">' + esc(p.org) + '</span></span></button>';
  }
  var BANNER = "";
  function more(total, shown) { return total > shown ? '<button class="btn sec" id="more" style="margin:10px 0">더 보기 (' + (total - shown) + '개 남음)</button>' : ""; }
  function bindMore() { var m = $("#more"); if (m) m.onclick = function () { S.limit += PAGE; render(); }; }
  function stamp() { return DB.index ? '<div class="meta" style="text-align:center;margin:12px 0">데이터 기준일 ' + esc(DB.index.updated) + ' · 공공데이터포털</div>' : ""; }

  function renderHome() {
    var list = S.profile ? matched() : DB.list.filter(function (p) { return p.region === "전국" && !p.special; }).sort(function (a, b) { return b.views - a.views; }).map(function (p) { return { p: p, m: null }; });
    var soon = list.filter(function (x) { var d = dday(x.p); return d !== null && d <= 30; }).sort(function (a, b) { return dday(a.p) - dday(b.p); }).slice(0, 3);
    var h = '<div class="hero">' + (S.profile ? '<b>' + (PF.list.length > 1 ? esc(S.profile.name) + ' 기준 혜택 ' : '내 조건에 맞는 혜택 ') + list.length + '개</b><p>' + esc(S.profile.region) + (S.profile.sub !== "전체" ? " " + esc(S.profile.sub) : "") + ' · ' + esc(S.profile.age) + ' 기준이에요. 공식 사이트에서 최종 확인하세요.</p>' : '<b>내 조건을 입력하면 맞는 혜택만 보여드려요</b><p>질문 6개, 40초면 끝나요.</p><br><button class="btn" id="goOnboard">내 조건 입력하기</button>') + '</div>';
    h += '<h2>마감 임박</h2>' + (soon.length ? soon.map(function (x) { return card(x.p, x.m); }).join("") : '<div class="empty">임박한 마감이 없어요</div>');
    h += '<h2>관심 분야별 정책</h2><div class="chips">' + ["전체"].concat(CATS).map(function (c) { return '<button class="chip' + (S.cat === c ? " on" : "") + '" data-cat="' + c + '">' + c + '</button>'; }).join("") + '</div>';
    var items = list.filter(function (x) { return S.cat === "전체" || x.p.cat === S.cat; });
    h += items.length ? items.slice(0, S.limit).map(function (x) { return card(x.p, x.m); }).join("") + more(items.length, S.limit) : '<div class="empty">이 분야 정책이 아직 없어요</div>';
    h += BANNER;
    h += '<h2>환급금 안내</h2>' + REFUNDS.map(function (r, i) { return '<button class="card" data-refund="' + i + '"><span class="t">' + r.t + '</span><span class="s">' + r.q + '</span></button>'; }).join("");
    h += stamp();
    view.innerHTML = h;
    var g = $("#goOnboard"); if (g) g.onclick = openOnboard;
    bindMore();
  }

  function renderMine() {
    if (!S.profile) { view.innerHTML = '<div class="empty">아직 조건을 입력하지 않았어요.<br><br><button class="btn sm" id="goOnboard">내 조건 입력하기</button></div>'; $("#goOnboard").onclick = openOnboard; return; }
    var list = matched();
    var h = '<h2>' + (PF.list.length > 1 ? esc(S.profile.name) + ' 혜택 ' : '내 혜택 ') + list.length + '개</h2><div class="meta">입력하신 조건과 맞을 가능성이 높은 순서예요. 결과는 참고용이에요.</div>';
    h += list.slice(0, S.limit).map(function (x) { return card(x.p, x.m); }).join("") + more(list.length, S.limit) + BANNER + stamp();
    view.innerHTML = h;
    bindMore();
  }

  function renderSearch() {
    var h = '<div class="seg">' + Object.keys(SRC).map(function (k) { return '<button data-src="' + k + '" class="' + (S.src === k ? "on" : "") + '">' + SRC[k] + '</button>'; }).join("") + '</div>';
    h += '<div class="search"><input id="q" placeholder="검색어 (예: 노인, 일자리, 주거)" value="' + esc(S.q) + '"><button class="btn sm" id="doSearch">검색</button></div>';
    var q = S.q.trim();
    var items = DB.list.filter(function (p) { return p.src === S.src && (!q || (p.title + p.summary + p.cat + p.org).indexOf(q) >= 0); }).sort(function (a, b) { return b.views - a.views; });
    h += '<div class="meta">' + (S.src === "central" ? "전국" : S.profile ? esc(S.profile.region) + " 지역" : "지역") + ' 기준 ' + items.length + '건</div>';
    h += items.length ? items.slice(0, S.limit).map(function (p) { return card(p, null); }).join("") + more(items.length, S.limit) : '<div class="empty">검색 결과가 없어요</div>';
    h += BANNER;
    view.innerHTML = h;
    var go = function () { S.q = $("#q").value; S.limit = PAGE; renderSearch(); };
    $("#doSearch").onclick = go;
    $("#q").onkeydown = function (e) { if (e.key === "Enter") go(); };
    bindMore();
  }

  function renderSaved() {
    var sv = S.saved.map(function (id) { return DB.byId[id]; }).filter(Boolean).sort(function (a, b) {
      var da = dday(a), db = dday(b);
      return (da === null ? 9999 : da) - (db === null ? 9999 : db);
    });
    var h = '<h2>관심정책 ' + sv.length + '개</h2><div class="meta">상세 화면에서 ☆를 눌러 저장한 정책이에요. 마감이 가까운 순서예요.</div>';
    h += sv.length ? sv.map(function (p) { return card(p, match(p)); }).join("") : '<div class="empty">저장한 정책이 없어요.<br>상세 화면에서 ☆를 눌러 저장해 보세요.</div>';
    h += '<button class="btn sec" id="goAlarm" style="margin-top:14px">⚙ 알림 설정</button>' + BANNER;
    view.innerHTML = h;
    $("#goAlarm").onclick = openSettings;
  }

  /* 배너는 목록이 있는 탭에서만. 시트·온보딩·오류·빈 화면에서는 숨긴다 */
  function adsSync() {
    if (!window.Ads || !Ads.native) return;
    var sheetOpen = !$("#sheet").classList.contains("hidden") || !$("#onboard").classList.contains("hidden");
    var hasList = !DB.error && DB.list.length && view.querySelector(".card");
    Ads.banner(!!(CFG.ads.banner === true && !sheetOpen && hasList));
  }
  function render() {
    updateHeader();
    if (DB.error) { view.innerHTML = '<div class="empty">' + esc(DB.error) + '<br><br><button class="btn sm" id="retry">다시 시도</button></div>'; $("#retry").onclick = function () { DB.error = ""; init().then(render); }; return; }
    ({ home: renderHome, mine: renderMine, search: renderSearch, alarm: renderSaved })[S.tab]();
    Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) { b.classList.toggle("on", b.dataset.tab === S.tab); });
    adsSync();
  }

  function openSheet(html) {
    var s = $("#sheet"); S.sheetKind = "";
    s.innerHTML = '<div class="in"><div class="sheet-top"><button class="sheet-x" id="sx">닫기 ✕</button></div>' + html + '</div>';
    s.classList.remove("hidden"); adsSync();
    s.onclick = function (e) { if (e.target === s) closeSheet(); };
    $("#sx").onclick = closeSheet;
  }
  function closeSheet() {
    var kind = S.sheetKind; S.sheetKind = "";
    $("#sheet").classList.add("hidden"); adsSync();
    /* 정책 상세를 다 보고 닫았을 때만 "한 번 봤다"로 센다 (전면광고 빈도 조절용) */
    if (kind === "detail" && window.Ads) Ads.viewDone(function () {
      return $("#sheet").classList.contains("hidden") && $("#onboard").classList.contains("hidden") && $("#appopen").classList.contains("hidden");
    });
  }

  function detail(id) {
    var p = DB.byId[id]; if (!p) return;
    var m = match(p); var saved = S.saved.indexOf(id) >= 0;
    var reasons = m && m.reasons.length ? '<div class="row">' + m.reasons.map(function (r) { return '<span class="tag ok">' + r + '</span>'; }).join("") + '</div>' : "";
    var period = p.deadline === "상시" ? (p.deadlineRaw ? esc(p.deadlineRaw) : "상시") : p.deadline + " (" + ddayLabel(p) + ")";
    openSheet('<div style="display:flex;justify-content:space-between"><h3>' + esc(p.title) + '</h3><button class="star" id="sv">' + (saved ? "★" : "☆") + '</button></div>' +
      reasons +
      '<dl class="kv"><dt>지원 내용</dt><dd>' + esc(clean(p.support || p.summary)) + '</dd><dt>지원 대상</dt><dd>' + esc(clean(p.target) || "공식 사이트에서 확인") + '</dd><dt>구분</dt><dd>' + SRC[p.src] + ' · ' + esc(p.cat) + '</dd><dt>신청 기간</dt><dd>' + period + '</dd><dt>신청 방법</dt><dd>' + esc(clean(p.method) || "공식 사이트에서 확인") + '</dd><dt>소관 기관</dt><dd>' + esc(p.org) + '</dd><dt>갱신일</dt><dd>' + esc(fmtDate(p.updated)) + '</dd></dl>' +
      '<div class="notice">이 앱은 정부 기관이 아니며, 공공데이터포털의 공공서비스(혜택) 정보를 바탕으로 안내합니다. 대상 여부와 금액은 반드시 공식 사이트에서 최종 확인하세요.</div>' +
      '<button class="btn" id="go">공식 신청 페이지로 이동</button><div class="row" style="margin-top:10px"><button class="btn sec sm" id="share">부모님께 공유</button><button class="btn sec sm" id="rep">정보 오류 신고</button></div>' + BANNER);
    S.sheetKind = "detail";
    $("#sv").onclick = function () { var i = S.saved.indexOf(id); if (i >= 0) S.saved.splice(i, 1); else S.saved.push(id); save("saved2", S.saved); detail(id); if (S.tab === "alarm") render(); };
    $("#go").onclick = function () { if (p.link) openLink(p.link); else alertIn("공식 링크가 없어요. 소관 기관 누리집에서 확인해 주세요."); };
    $("#share").onclick = function () {
      var t = p.title + " - " + p.summary + (p.link ? " " + p.link : "");
      var SH = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Share;
      if (window.Ads && Ads.native && SH) SH.share({ title: p.title, text: t }).catch(function () {}); else if (navigator.share) navigator.share({ title: p.title, text: t }); else { try { navigator.clipboard.writeText(t); } catch (e) {} alertIn("내용을 복사했어요"); }
    };
    $("#rep").onclick = function () { alertIn("신고가 접수되었어요 (시연)"); };
  }

  function refund(i) {
    var r = REFUNDS[i];
    openSheet('<h3>' + r.t + '</h3><p>' + r.q + '</p><dl class="kv"><dt>조회 방법</dt><dd>' + r.how + '</dd></dl><div class="notice">금액은 앱이 계산하지 않아요. 공식 사이트에서 직접 조회하세요.</div><button class="btn" id="go">조회 사이트로 이동</button>' + BANNER);
    $("#go").onclick = function () { openLink(r.link); };
  }

  /* ---------- 프로필 화면 ---------- */
  function updateHeader() {
    var b = $("#btnProfile"); if (!b) return;
    b.textContent = S.profile ? "👤 " + S.profile.name + " ▾" : "내 조건";
  }
  function dlgEl() {
    var d = $("#dlg");
    if (!d) { d = document.createElement("div"); d.id = "dlg"; d.className = "dlg hidden"; document.body.appendChild(d); }
    return d;
  }
  function loadingIn(msg) {
    var d = dlgEl(); d.innerHTML = '<div class="box"><p class="msg">' + esc(msg) + '</p></div>';
    d.classList.remove("hidden"); dlgResolve = null; d.onclick = null;
    return function () { d.classList.add("hidden"); };
  }
  function profSub(p) { return esc(p.region) + (p.sub && p.sub !== "전체" ? " " + esc(p.sub) : "") + " · " + esc(p.age); }
  function openFamily() {
    var F = CFG.family, max = F.maxProfiles || 5;
    var rows = PF.list.map(function (p) {
      var on = p.id === PF.active;
      return '<div class="frow"><button class="fpick' + (on ? " on" : "") + '" data-fp="' + esc(p.id) + '"><b>' + (on ? "✔ " : "") + esc(p.name) + '</b><span class="meta">' + profSub(p) + '</span></button>' +
        '<button class="ghost" data-fe="' + esc(p.id) + '">수정</button>' + (PF.list.length > 1 ? '<button class="ghost del" data-fd="' + esc(p.id) + '">삭제</button>' : "") + '</div>';
    }).join("");
    var needAd = !!(F.adToAdd && window.Ads && Ads.native && Ads.canReward() && !(PF.credit > 0));
    var adNote = needAd ? "광고를 끝까지 보면 바로 추가돼요. " : "";
    openSheet('<h3>프로필</h3><p class="meta">부모님·배우자 조건을 따로 저장해 두고, 바꿔 가며 맞는 혜택을 볼 수 있어요.</p>' + rows +
      (F.enabled !== false ? '<button class="btn" id="fAdd" style="margin-top:14px">' + "＋ 가족 프로필 추가" + '</button><div class="meta" style="margin-top:6px">' + adNote + '(최대 ' + max + '개)</div>' : ""));
    var sh = $("#sheet");
    Array.prototype.forEach.call(sh.querySelectorAll("[data-fp]"), function (b) {
      b.onclick = function () { setActive(b.dataset.fp); closeSheet(); S.limit = PAGE; loadRegion(S.profile.region).then(render); };
    });
    Array.prototype.forEach.call(sh.querySelectorAll("[data-fe]"), function (b) {
      b.onclick = function () { setActive(b.dataset.fe); closeSheet(); loadRegion(S.profile.region).then(function () { render(); openOnboard(); }); };
    });
    Array.prototype.forEach.call(sh.querySelectorAll("[data-fd]"), function (b) {
      b.onclick = function () {
        var id = b.dataset.fd, p = PF.list.filter(function (x) { return x.id === id; })[0];
        confirmIn("'" + p.name + "' 프로필을 삭제할까요?").then(function (ok) {
          if (!ok) return;
          PF.list = PF.list.filter(function (x) { return x.id !== id; });
          if (PF.active === id) PF.active = PF.list[0].id;
          savePF(); S.profile = activeP();
          loadRegion(S.profile.region).then(function () { render(); openFamily(); });
        });
      };
    });
    var add = $("#fAdd"); if (add) add.onclick = function () { closeSheet(); addFamily(); };
  }
  /* 가족 프로필 추가: 보상형 광고를 끝까지 보면 추가한다(앱 안에서만. 광고를 못 받으면 추가하지 않고 안내만 한다) */
  function addFamily() {
    var F = CFG.family, max = F.maxProfiles || 5;
    if (PF.list.length >= max) { alertIn("프로필은 최대 " + max + "개까지 만들 수 있어요."); return; }
    if ((PF.credit || 0) > 0 || !(F.adToAdd && window.Ads && Ads.native && Ads.canReward())) { openOnboard({ isNew: true }); return; }   /* 이미 광고를 보고 얻은 추가 권리가 있으면 그대로 진행 */
    confirmIn("가족 프로필을 추가하려면 광고를 한 번 보셔야 해요.\n끝까지 보시면 바로 추가할 수 있어요.", "▶ 광고 보고 추가", "취소").then(function (ok) {
      if (!ok) return;
      var stop = loadingIn("광고를 불러오는 중이에요…"), t0 = Date.now();
      Ads.rewardedPrepare().then(function () {
        (function wait() {
          if (Ads.rewardedReady()) {
            stop();
            Ads.rewardedShow().then(function (earned) {
              if (earned) { PF.credit = (PF.credit || 0) + 1; savePF(); openOnboard({ isNew: true }); }   /* 약속한 보상은 저장해 둔다(조건 입력을 중간에 닫아도 사라지지 않게) */
              else alertIn("광고를 끝까지 보셔야 추가할 수 있어요.");
            });
            return;
          }
          if (Date.now() - t0 > 15000) { stop(); alertIn("광고를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요."); return; }
          setTimeout(wait, 400);
        })();
      });
    });
  }

  function openOnboard(opts) {
    var isNew = !!(opts && opts.isNew), off = isNew ? 1 : 0, edit = isNew ? null : S.profile;
    var NAMES = ["어머니", "아버지", "배우자", "자녀", "형제·자매", "기타 가족"];
    var regions = DB.index ? Object.keys(DB.index.files).filter(function (r) { return r !== "전국"; }) : ["서울"];
    var a = { id: edit ? edit.id : (isNew ? null : "me"), name: edit ? edit.name : (isNew ? "" : "나"), age: edit ? edit.age : null, region: edit ? edit.region : regions[0], sub: edit ? edit.sub : "전체", hh: edit ? edit.hh.slice() : [], income: edit ? edit.income : null, attrs: edit && edit.attrs ? edit.attrs.slice() : [], cats: edit ? edit.cats.slice() : [] };
    var step = isNew ? -1 : 0, N = 6;
    var box = $("#onboard"); box.classList.remove("hidden"); adsSync();
    function opt(label, on, attr) { return '<button class="opt' + (on ? " on" : "") + '" ' + attr + '>' + label + '</button>'; }
    function draw() {
      var title = step < 0 ? "누구의 조건인가요?" : ["나이대가 어떻게 되세요?", "어디에 사세요?", "어떤 가구인가요? (여러 개 선택)", "생활 형편은 어떤 편인가요?", "해당되는 게 있으면 골라주세요", "관심 있는 분야를 골라주세요"][step];
      var body = "", ok = false;
      if (step === -1) {
        body = NAMES.map(function (n) { return opt(n, a.name === n, 'data-v="' + n + '"'); }).join("") +
          '<input id="nm" class="nminput" placeholder="직접 입력 (예: 장모님)" maxlength="10" value="' + (NAMES.indexOf(a.name) < 0 ? esc(a.name) : "") + '">';
        ok = !!(a.name && a.name.trim());
      }
      if (step === 0) { body = BANDS.map(function (b) { return opt(b[0], a.age === b[0], 'data-v="' + b[0] + '"'); }).join(""); ok = !!a.age; }
      if (step === 1) {
        body = '<button class="selbtn" id="rg">' + esc(a.region) + ' ▾</button><br><br><button class="selbtn" id="sb">' + esc(a.sub) + ' ▾</button><div class="meta" style="margin-top:8px">시·군·구를 고르면 내 동네 정책이 함께 보여요.</div>'; ok = true;
      }
      if (step === 2) { body = HH.map(function (h) { return opt(h[1], a.hh.indexOf(h[0]) >= 0, 'data-v="' + h[0] + '"'); }).join(""); ok = a.hh.length > 0; }
      if (step === 3) { body = INCOMES.map(function (h) { return opt(h[1], a.income === h[0], 'data-v="' + h[0] + '"'); }).join("") + '<div class="meta">정확한 금액은 묻지 않아요. 대략적인 구간만 이 기기에 저장돼요.</div>'; ok = !!a.income; }
      if (step === 4) { body = ATTRS.map(function (h) { return opt(h[1], a.attrs.indexOf(h[0]) >= 0, 'data-v="' + h[0] + '"'); }).join("") + '<div class="meta">없으면 그냥 다음을 눌러 주세요. 해당되는 것만 맞는 정책을 더 정확히 보여드려요.</div>'; ok = true; }
      if (step === 5) { body = '<div class="chips">' + CATS.map(function (c) { return '<button class="chip' + (a.cats.indexOf(c) >= 0 ? " on" : "") + '" data-v="' + c + '">' + c + '</button>'; }).join("") + '</div>'; ok = true; }
      box.innerHTML = '<div class="in">' + (S.profile ? '<div class="sheet-top"><button class="sheet-x" id="obClose">닫기 ✕</button></div>' : '') + '<div class="prog"><i style="width:' + ((step + 1 + off) / (N + off) * 100) + '%"></i></div><div class="meta">' + (step + 1 + off) + ' / ' + (N + off) + '</div><div class="q">' + title + '</div><div class="opts">' + body + '</div>' +
        '<div class="row">' + (step > -off ? '<button class="btn sec sm" id="prev">이전</button>' : '') + '<button class="btn" id="next" style="flex:1"' + (ok ? "" : " disabled") + '>' + (step === N - 1 ? "결과 보기" : "다음") + '</button></div></div>';
      if ($("#next").disabled) $("#next").style.opacity = ".4";
      var oc = $("#obClose"); if (oc) oc.onclick = function () { box.classList.add("hidden"); adsSync(); };
      var nmI = $("#nm");
      if (nmI) nmI.oninput = function () {
        a.name = this.value.trim();
        var nx = $("#next"); nx.disabled = !a.name; nx.style.opacity = a.name ? "" : ".4";
        Array.prototype.forEach.call(box.querySelectorAll(".opt"), function (b) { b.classList.remove("on"); });
      };
      Array.prototype.forEach.call(box.querySelectorAll("[data-v]"), function (el) {
        el.onclick = function () {
          var v = el.dataset.v;
          if (step === -1) a.name = v;
          if (step === 0) a.age = v;
          if (step === 2) { var i = a.hh.indexOf(v); if (i >= 0) a.hh.splice(i, 1); else a.hh.push(v); }
          if (step === 3) a.income = v;
          if (step === 4) { var k = a.attrs.indexOf(v); if (k >= 0) a.attrs.splice(k, 1); else a.attrs.push(v); }
          if (step === 5) { var j = a.cats.indexOf(v); if (j >= 0) a.cats.splice(j, 1); else a.cats.push(v); }
          draw();
        };
      });
      if (step === 1) {
        $("#rg").onclick = function () { pickIn("시·도를 골라 주세요", regions, a.region).then(function (v) { if (!v || v === a.region) return; a.region = v; a.sub = "전체"; loadRegion(a.region).then(draw); }); };
        $("#sb").onclick = function () { pickIn("시·군·구를 골라 주세요", subsOf(a.region), a.sub).then(function (v) { if (!v) return; a.sub = v; draw(); }); };
      }
      if ($("#prev")) $("#prev").onclick = function () { step--; draw(); };
      $("#next").onclick = function () {
        if (this.disabled) return;
        if (step === 0) { loadRegion(a.region).then(function () { step++; draw(); }); return; }
        if (step < N - 1) { step++; draw(); return; }
        var rec = { id: a.id || ("p" + Date.now()), name: a.name || "나", age: a.age, region: a.region, sub: a.sub, hh: a.hh, income: a.income, attrs: a.attrs, cats: a.cats };
        var ix = PF.list.map(function (x) { return x.id; }).indexOf(rec.id);
        if (ix >= 0) PF.list[ix] = rec; else { PF.list.push(rec); PF.credit = Math.max(0, (PF.credit || 0) - 1); }
        PF.active = rec.id; savePF(); S.profile = rec; updateHeader();
        S.tab = "mine"; S.limit = PAGE; box.classList.add("hidden"); adsSync();
        loadRegion(a.region).then(render);
      };
    }
    draw();
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-id],[data-cat],[data-src],[data-refund]");
    if (!el) return;
    if (el.dataset.id) detail(el.dataset.id);
    else if (el.dataset.refund) refund(+el.dataset.refund);
    else if (el.dataset.cat) { S.cat = el.dataset.cat; S.limit = PAGE; render(); }
    else if (el.dataset.src) { S.src = el.dataset.src; S.limit = PAGE; render(); }
  });
  $("#tabs").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; if (b.dataset.tab === "ins") { openInsurance(); return; } S.tab = b.dataset.tab; S.limit = PAGE; render(); window.scrollTo(0, 0); };
  $("#btnProfile").onclick = function () { if (!S.profile) openOnboard(); else openFamily(); };

  function openSettings() {
    var sw = function (k, t) { return '<label class="switch"><span>' + t + '</span><input type="checkbox" data-sal="' + k + '"' + (S.alarm[k] ? " checked" : "") + '></label>'; };
    var times = ["오전 8시", "오전 10시", "낮 12시", "오후 6시", "오후 8시"];
    var cur = S.alarm.time || "오전 10시";
    openSheet('<h3>설정</h3><h2 style="margin-top:14px">알림</h2>' +
      sw("d7", "마감 7일 전 알림") + sw("d1", "마감 하루 전 알림") + sw("fresh", "내 조건에 맞는 새 정책 알림") +
      '<div class="switch"><span>알림 받을 시간</span><button class="selbtn small" id="atime">' + esc(cur) + ' ▾</button></div>' +
      '<h2>앱</h2>' +
      '<button class="srow" id="sPro"><span>내 조건 다시 입력</span><span class="meta">' + (S.profile ? esc(S.profile.region) + " · " + esc(S.profile.age) : "미입력") + '</span></button>' +
      '<button class="srow" id="sTerms"><span>이용약관</span><span class="meta">›</span></button>' +
      '<button class="srow" id="sPriv"><span>개인정보처리방침</span><span class="meta">›</span></button>' +
      '<button class="srow" id="sSrc"><span>데이터 출처 · 안내</span><span class="meta">›</span></button>' +
      '<button class="srow" id="sInq"><span>문의하기</span><span class="meta">›</span></button>' +
      (CFG.debug.rewardedTest ? '<button class="srow" id="sRw"><span>보상형 광고 시험 (개발용)</span><span class="meta">›</span></button>' : "") +
      '<button class="srow" id="sDel" style="color:var(--warn)"><span>내 정보 모두 삭제</span><span class="meta">기기에서 삭제</span></button>' +
      '<div class="meta" style="margin-top:14px">복지클럽 v0.2 · 데이터 기준일 ' + (DB.index ? esc(DB.index.updated) : "-") + '</div>');
    Array.prototype.forEach.call(document.querySelectorAll("[data-sal]"), function (el) {
      el.onchange = function () { S.alarm[el.dataset.sal] = el.checked; save("alarm", S.alarm); };
    });
    $("#atime").onclick = function () {
      var b = this;
      pickIn("알림 받을 시간", times, S.alarm.time || cur).then(function (v) { if (!v) return; S.alarm.time = v; save("alarm", S.alarm); b.textContent = v + " ▾"; });
    };
    $("#sPro").onclick = function () { closeSheet(); openOnboard(); };
    var rw = $("#sRw");
    if (rw) rw.onclick = function () {
      /* 개발용: 보상형 광고를 받아서(최대 15초 기다림) 보여주고 보상 여부를 알려준다. config.json 의 debug.rewardedTest 가 true 일 때만 나타난다 */
      var t0 = Date.now();
      Ads.rewardedPrepare().then(function () {
        (function wait() {
          if (Ads.rewardedReady()) { Ads.rewardedShow().then(function (earned) { alertIn(earned ? "보상을 받았어요 (시험)" : "보상 없음 (시험)"); }); return; }
          if (Date.now() - t0 > 15000) { alertIn("보상형 광고를 받지 못했어요 (시험)"); return; }
          setTimeout(wait, 400);
        })();
      });
    };
    $("#sTerms").onclick = function () { openLink("https://bokji.imeji.com/terms.html"); };
    $("#sPriv").onclick = function () { openLink("https://bokji.imeji.com/privacy.html"); };
    $("#sSrc").onclick = function () { alertIn("이 앱은 정부 기관이 아니며, 공공데이터포털(행정안전부 대한민국 공공서비스(혜택) 정보)을 바탕으로 안내합니다. 대상 여부와 금액은 공식 사이트에서 최종 확인하세요."); };
    $("#sInq").onclick = function () { alertIn("문의는 Google Play 스토어의 복지클럽 상세 페이지 아래쪽 '개발자 연락처'로 보내 주세요."); };
    $("#sDel").onclick = function () {
      confirmIn("저장한 조건, 저장한 정책, 알림 설정을 이 기기에서 모두 지울까요?").then(function (ok) {
        if (!ok) return;
        try { localStorage.removeItem("profile2"); localStorage.removeItem("profiles3"); localStorage.removeItem("saved2"); localStorage.removeItem("alarm"); } catch (e) {}
        PF = { list: [], active: "" }; S.profile = null; S.saved = []; S.alarm = { d7: true, d1: true, fresh: true };
        closeSheet(); render();
      });
    };
  }
  $("#btnSettings").onclick = openSettings;

  /* 안드로이드 뒤로가기: 시트 닫기 → 조건 입력 이전/닫기 → 다른 탭이면 홈 → 홈이면 앱 종료 */
  (function () {
    var AppP = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App;
    if (!(window.Ads && Ads.native && AppP && AppP.addListener)) return;
    AppP.addListener("backButton", function () {
      if (dlgResolve) { dlgResolve(false); return; }
      if (!$("#appopen").classList.contains("hidden")) return;
      if (!$("#sheet").classList.contains("hidden")) { closeSheet(); return; }
      var ob = $("#onboard");
      if (!ob.classList.contains("hidden")) {
        var prev = $("#prev");
        if (prev) { prev.click(); return; }
        if (S.profile) { ob.classList.add("hidden"); adsSync(); return; }
        AppP.exitApp(); return;
      }
      if (S.tab !== "home") { S.tab = "home"; S.limit = PAGE; render(); window.scrollTo(0, 0); return; }
      AppP.exitApp();
    });
  })();

  /* 시작: 로고 화면(#splash)을 깔아 둔 채로 앱오프닝 광고를 보여주고, 광고가 끝나거나 건너뛰면 앱을 보여준다 */
  var splash = $("#splash");
  var SPLASH_T0 = Date.now();
  /* 로고 화면은 최소 minMs(기본 1.8초) 동안 보여주고 부드럽게 사라진다. 광고가 없어도 너무 빨리 닫히지 않게 */
  function hideSplash() {
    if (!splash || splash.dataset.closing) return;
    var left = Math.max(0, (CFG.splash.minMs || 0) - (Date.now() - SPLASH_T0));
    splash.dataset.closing = "1";
    setTimeout(function () {
      splash.classList.add("fade");
      setTimeout(function () { splash.classList.add("hidden"); }, 320);
    }, left);
  }
  setTimeout(hideSplash, 9000);   /* 무슨 일이 있어도 9초 뒤엔 앱을 보여준다 */
  init().then(function () {
    render();
    var afterOpen = function () { if (!S.profile && !DB.error) openOnboard(); };
    if (window.Ads && Ads.native) { Ads.launch(function () { hideSplash(); afterOpen(); adsSync(); }); return; }
    hideSplash();
    /* 웹 미리보기: 하루 첫 실행에만 시연 화면 */
    var ao = load("ao", "");
    if (ao !== TODAY) {
      save("ao", TODAY);
      var box = $("#appopen"); box.classList.remove("hidden");
      box.innerHTML = '<div style="font-size:13px;opacity:.7">광고 · 앱오프닝 광고 영역 (시연)</div><div style="font-size:22px;font-weight:700">복지클럽</div><button class="btn sm" id="aoClose" style="margin-top:20px">닫고 시작하기</button>';
      $("#aoClose").onclick = function () { box.classList.add("hidden"); afterOpen(); };
    } else { afterOpen(); }
  });
})();
