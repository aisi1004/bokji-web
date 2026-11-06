/* 광고(AdMob). 지금은 구글 공식 테스트 광고만 쓴다. 출시 전에 실제 단위 ID 로 바꾸고 UMP 동의 메시지를 만든다.
   - 배너: 화면 위쪽, 목록이 있는 탭(홈·내 혜택·검색·관심정책)에서만. 상세·설정·온보딩·빈 화면에서는 숨긴다.
   - 앱오프닝: 앱을 켜거나 돌아올 때만. 배너와 겹치지 않게 배너를 잠시 멈춘다. */
(function () {
  var NATIVE = false;
  try { NATIVE = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); } catch (e) {}
  var PLAT = "android";
  try { PLAT = Capacitor.getPlatform() === "ios" ? "ios" : "android"; } catch (e) {}
  function PL(n) { try { return window.Capacitor && Capacitor.Plugins && Capacitor.Plugins[n]; } catch (e) { return null; } }

  var TEST = {
    android: { banner: "ca-app-pub-3940256099942544/6300978111", appOpen: "ca-app-pub-3940256099942544/9257395921", interstitial: "ca-app-pub-3940256099942544/1033173712", rewarded: "ca-app-pub-3940256099942544/5224354917" },
    ios: { banner: "ca-app-pub-3940256099942544/2934735716", appOpen: "ca-app-pub-3940256099942544/5575463023", interstitial: "ca-app-pub-3940256099942544/4411468910", rewarded: "ca-app-pub-3940256099942544/1712485313" }
  };
  var S = { inited: null, banner: false, bannerWant: false, openLoaded: false, showing: false, bgAt: Date.now(), startAt: Date.now(), lastOpenAt: 0, lastIsAt: 0, isLoaded: false, isShowing: false, isReq: false, isCfg: null, aoCfg: { enabled: true, gapMin: 240, skipFirstLaunch: true, resumeAfterMin: 30 }, canShow: function () { return true; } };
  var AD_TTL = 50 * 60 * 1000;   /* Meta·AdMob 전면/보상형은 받은 지 60분이 지나면 무효(무효 광고는 수익이 안 잡힌다) → 50분 지나면 새로 받는다 */
  var TESTING = true;   /* 구글 테스트 ID 를 쓰는 동안 true. 실제 ID 로 바꿀 때 false 로 (true 면 앱오프닝 간격 제한을 끄고 매번 보여 확인할 수 있다) */

  /* 광고 회사 선택: config.json 의 ads.provider 가 "meta" 이고 · Android 이고 · 그 형식의 Meta 광고(placement) ID 가 채워져 있을 때만 Meta.
     ID 가 비어 있으면 자동으로 AdMob 으로 돌아간다(그래서 provider 를 먼저 meta 로 바꿔 둬도 안전하다). Meta 에는 앱오프닝 형식이 없어 앱오프닝은 항상 AdMob. */
  S.provider = "admob"; S.fallback = "admob"; S.off = false; S.meta = { test: false, testDevices: [], android: {}, ios: {} };
  function setProvider(provider, meta, fallback, enabled) {
    S.provider = provider || "admob"; S.fallback = fallback === "none" ? "none" : "admob"; S.off = enabled === false;   /* enabled=false 면 모든 광고를 끈다 */
    if (meta) for (var k in meta) S.meta[k] = meta[k];
    try { localStorage.setItem("ad_noao", noFallback("appOpen") ? "1" : "0"); } catch (e) {}   /* 다음 실행 때 시작 광고를 미리 받을지 */
  }
  function metaId(kind) { return ((S.meta[PLAT] || {})[kind]) || ""; }
  /* provider 가 meta 이고 fallback 이 none 이면, Meta 광고 ID 가 없는 형식은 AdMob 으로 바꿔 보여주지 않고 아예 안 보여준다.
     (Meta 에는 앱오프닝 형식이 없어서 이때 앱오프닝도 나오지 않는다) */
  function noFallback(kind) { return NATIVE && (S.off || (S.provider === "meta" && S.fallback === "none" && !useMeta(kind))); }
  function useMeta(kind) { return NATIVE && !S.off && PLAT === "android" && S.provider === "meta" && !!PL("MetaAds") && !!metaId(kind); }
  function metaInit() {
    if (S.mInit) return S.mInit;
    var M = PL("MetaAds");
    S.mInit = !M ? Promise.resolve(false) : init().then(function (ok) {
      if (!ok) return false;   /* 동의(UMP)를 먼저 거친다 */
      return M.init({ test: !!S.meta.test, testDevices: S.meta.testDevices || [] }).then(function () { return true; }, function () { return false; });
    });
    return S.mInit;
  }

  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }   /* 0 도 유효한 값(= 제한 없음)으로 읽는다 */
  function log(m) { try { console.log("[ad] " + m); } catch (e) {} }
  /* 플러그인은 배너를 화면 위쪽 안전 영역(카메라 구멍·시스템 바) 높이만큼 내려서 그린다. 같은 높이를 화면에도 비워 둔다 */
  function topInset() {
    try {
      var d = document.createElement("div");
      d.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;padding-top:max(env(safe-area-inset-top,0px),var(--safe-area-inset-top,0px))";
      document.body.appendChild(d);
      var v = parseFloat(getComputedStyle(d).paddingTop) || 0;
      document.body.removeChild(d); return v;
    } catch (e) { return 0; }
  }
  function slot(h) {
    var r = document.documentElement.style;
    r.setProperty("--adh", (h || 0) + "px");
    r.setProperty("--adtop", h ? (topInset() + 8) + "px" : "0px");   /* 배너와 제목줄 사이에 8px 간격 */
  }

  function init() {
    if (S.inited) return S.inited;
    var A = PL("AdMob");
    if (!NATIVE || !A) return (S.inited = Promise.resolve(false));
    S.inited = Promise.resolve()
      .then(function () { return PLAT === "ios" && A.requestTrackingAuthorization ? A.requestTrackingAuthorization().catch(function () {}) : null; })
      .then(function () { return A.requestConsentInfo({}).catch(function () { return null; }); })
      .then(function (info) {
        if (info && info.isConsentFormAvailable && info.status === "REQUIRED") return A.showConsentForm().catch(function () { return info; });
        return info;
      })
      .then(function (info) {
        if (info && info.canRequestAds === false) return false;
        return A.initialize({ initializeForTesting: true }).then(function () { return true; });
      })
      .catch(function (e) { log("init fail " + e); return false; });
    return S.inited;
  }

  /* 배너: 켜 달라고 하면 (이미 떠 있지 않을 때) 띄우고, 끄라고 하면 숨긴다 */
  function banner(on) {
    S.bannerWant = on;
    if (!NATIVE) return;
    if (noFallback("banner")) return;
    if (useMeta("banner")) {
      metaInit().then(function (ok) {
        var M = PL("MetaAds"); if (!ok || !M || S.showing) return;
        if (on) {
          if (S.mBanner) { M.resumeBanner().then(function () { slot(50); }, function () {}); return; }
          S.mBanner = true;
          M.addListener("bannerFailed", function (e) { log("meta banner fail " + JSON.stringify(e || {})); slot(0); });
          M.showBanner({ placementId: metaId("banner"), position: "top" }).then(function () { slot(50); }, function () { S.mBanner = false; });
        } else if (S.mBanner) { slot(0); M.hideBanner().catch(function () {}); }
      });
      return;
    }
    init().then(function (ok) {
      var A = PL("AdMob"); if (!ok || !A) return;
      if (S.showing) return;
      if (on) {
        if (S.banner) { A.resumeBanner().then(function () { slot(S.h || 50); }, function () {}); return; }
        S.banner = true;
        A.addListener("bannerAdSizeChanged", function (s) { if (s && s.height) { S.h = Math.ceil(s.height); if (S.bannerWant) slot(S.h); } });
        A.addListener("bannerAdFailedToLoad", function (e) { log("banner fail " + JSON.stringify(e || {})); slot(0); });
        A.showBanner({ adId: TEST[PLAT].banner, adSize: "BANNER", position: "TOP_CENTER", margin: 0, isTesting: true })
          .catch(function (e) { S.banner = false; log("showBanner " + e); });
      } else if (S.banner) {
        slot(0);
        A.hideBanner().catch(function () {});
      }
    });
  }

  /* 앱오프닝: 미리 받아 두고, 열 때 보여준다 */
  function openLoad() {
    if (S.olReq || noFallback("appOpen")) return; S.olReq = true;
    init().then(function (ok) {
      var A = PL("AdMob"); if (!ok || !A) { S.olReq = false; return; }
      if (!S.ol) {
        S.ol = true;
        ["Loaded", "FailedToLoad", "Opened", "Closed", "FailedToShow"].forEach(function (n) {
          A.addListener("appOpenAd" + n, function (e) {
            log("appOpen " + n + " " + JSON.stringify(e || {}));
            if (n === "Closed" || n === "FailedToShow") { S.showing = false; S.olReq = false; if (S.bannerWant) banner(true); openLoad(); }
          });
        });
      }
      S.olStartAt = Date.now();   /* 기다리는 시간은 광고 요청이 실제로 시작된 때부터 센다(첫 실행의 동의 확인이 오래 걸려도 억울하게 포기하지 않도록) */
      A.loadAppOpen({ adId: TEST[PLAT].appOpen, isTesting: true }).catch(function (e) { log("loadAppOpen " + e); });
    });
  }
  /* 앱오프닝 정책: 앱을 켜거나 돌아올 때만 · 사용자가 앱을 쓰기 전에 · 다른 광고 직전·직후엔 안 띄움 · 간격 제한 */
  function aoLast() { try { return +localStorage.getItem("ad_ao") || 0; } catch (e) { return 0; } }
  function aoAllowed(kind) {
    var c = S.aoCfg; if (c.enabled === false || noFallback("appOpen")) return false;
    if (Date.now() - S.lastIsAt < 60000) return false;                  /* 전면광고 직후 금지 */
    if (kind === "launch" && c.skipFirstLaunch !== false) {            /* 설치 후 첫 실행은 광고 없이 시작 */
      var first = true; try { first = !localStorage.getItem("ad_first"); localStorage.setItem("ad_first", "1"); } catch (e) {}
      if (first) return false;
    }
    if (!TESTING && c.gapMin > 0 && Date.now() - aoLast() < c.gapMin * 60000) return false;   /* 간격 제한(기본 4시간) */
    return true;
  }
  function openShow(kind) {
    if (!NATIVE) return Promise.resolve(false);
    return init().then(function (ok) {
      var A = PL("AdMob"); if (!ok || !A) return false;
      return A.isAppOpenLoaded({ adId: TEST[PLAT].appOpen }).then(function (r) {
        if (!(r && r.value)) return false;
        if (Date.now() - S.lastIsAt < 60000) return false;   /* 전면광고 직후에는 앱오프닝을 띄우지 않는다 */
        S.showing = true; S.lastOpenAt = Date.now(); try { localStorage.setItem("ad_ao", String(S.lastOpenAt)); } catch (e) {}
        try { A.hideBanner().catch(function () {}); } catch (e) {}
        slot(0);
        return A.showAppOpen({ adId: TEST[PLAT].appOpen }).then(function () { return true; }, function () { S.showing = false; return false; });
      }, function () { return false; });
    }).catch(function () { return false; });
  }
  /* 전면광고 — AdMob 정책(Disallowed/Recommended interstitial implementations) 기준
     · 앱 시작·종료·백그라운드에서는 띄우지 않는다(시작은 앱오프닝이 맡는다)
     · 자연스러운 끊김(정책 상세를 다 보고 닫은 뒤)에서만, 사용자 동작 4번에 1번 이하로, 최소 간격·하루 한도를 둔다
     · 미리 받아 두고, 준비되지 않았으면 건너뛴다. 앱오프닝·다른 전면광고 직후에는 띄우지 않는다
     · 띄우기 직전에 잠깐(0.8초) 기다렸다가, 그 사이 사용자가 다른 화면을 열었으면 취소한다 */
  var IS_KEY = "ad_is";
  function isState() {
    var st = { last: 0, day: "", n: 0, views: 0 };
    try { var v = JSON.parse(localStorage.getItem(IS_KEY) || "null"); if (v) st = v; } catch (e) {}
    var d = new Date(), today = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    if (st.day !== today) { st.day = today; st.n = 0; }
    return st;
  }
  function isSave(st) { try { localStorage.setItem(IS_KEY, JSON.stringify(st)); } catch (e) {} }
  function isLoad() {
    if (!NATIVE || S.isReq || !S.isCfg || S.isCfg.enabled === false || noFallback("interstitial")) return;
    S.isReq = true;
    if (useMeta("interstitial")) {
      metaInit().then(function (ok) {
        var M = PL("MetaAds"); if (!ok || !M) { S.isReq = false; return; }
        S.isUsing = "meta";
        if (!S.isml) {
          S.isml = true;
          M.addListener("interstitialLoaded", function () { S.isLoaded = true; S.isLoadedAt = Date.now(); log("meta interstitial Loaded"); });
          M.addListener("interstitialFailed", function (e) { S.isLoaded = false; S.isReq = false; log("meta interstitial Failed " + JSON.stringify(e || {})); setTimeout(isLoad, 60000); });
          M.addListener("interstitialClosed", function () {
            S.isShowing = false; S.isLoaded = false; S.isReq = false; S.lastIsAt = Date.now();
            if (S.bannerWant) banner(true);
            setTimeout(isLoad, 1000);
          });
        }
        M.loadInterstitial({ placementId: metaId("interstitial") }).catch(function (e) { S.isReq = false; log("meta loadInterstitial " + e); });
      });
      return;
    }
    S.isUsing = "admob";
    init().then(function (ok) {
      var A = PL("AdMob"); if (!ok || !A) { S.isReq = false; return; }
      if (!S.isl) {
        S.isl = true;
        A.addListener("interstitialAdLoaded", function () { S.isLoaded = true; S.isLoadedAt = Date.now(); log("interstitial Loaded"); });
        A.addListener("interstitialAdFailedToLoad", function (e) { S.isLoaded = false; S.isReq = false; log("interstitial FailedToLoad " + JSON.stringify(e || {})); setTimeout(isLoad, 60000); });
        ["interstitialAdDismissed", "interstitialAdFailedToShow"].forEach(function (n) {
          A.addListener(n, function () {
            log(n); S.isShowing = false; S.isLoaded = false; S.isReq = false; S.lastIsAt = Date.now();
            if (S.bannerWant) banner(true);
            setTimeout(isLoad, 1000);
          });
        });
      }
      A.prepareInterstitial({ adId: TEST[PLAT].interstitial, isTesting: true }).catch(function (e) { S.isReq = false; log("prepareInterstitial " + e); });
    });
  }
  function setInterstitial(cfg) { S.isCfg = cfg || { enabled: false }; if (NATIVE && S.isCfg.enabled !== false) isLoad(); }
  /* 정책 상세를 하나 다 보고 닫을 때마다 부른다. canShow() 는 지금 다른 화면이 떠 있지 않은지 앱이 알려 준다 */
  function viewDone(canShow) {
    var c = S.isCfg; if (!NATIVE || !c || c.enabled === false) return;
    var st = isState(); st.views++; isSave(st);
    var now = Date.now();
    if (st.views < Math.max(1, num(c.everyViews, 4))) return;
    if (now - st.last < num(c.minGapSec, 180) * 1000) return;
    if (now - S.startAt < num(c.firstDelaySec, 90) * 1000) return;
    if (S.lastOpenAt && now - S.lastOpenAt < num(c.afterAppOpenSec, 90) * 1000) return;
    if (st.n >= num(c.dailyMax, 5)) return;
    if (S.isLoaded && now - (S.isLoadedAt || 0) > AD_TTL) { S.isLoaded = false; S.isReq = false; isLoad(); return; }   /* 받은 지 오래된 광고는 무효가 되니 새로 받는다 */
    if (!S.isLoaded || S.showing || S.isShowing) return;
    setTimeout(function () {
      if (!canShow() || !S.isLoaded || S.showing || S.isShowing) return;
      var A = S.isUsing === "meta" ? PL("MetaAds") : PL("AdMob"); if (!A) return;
      var s2 = isState(); s2.last = Date.now(); s2.n++; s2.views = 0; isSave(s2);
      S.isShowing = true;
      A.showInterstitial().catch(function (e) { S.isShowing = false; S.isLoaded = false; S.isReq = false; log("showInterstitial " + e); setTimeout(isLoad, 1000); });
    }, num(c.delayMs, 800));
  }
  /* 보상형 광고 — 지금 앱 화면에는 쓰지 않는다(보상을 주는 화면은 정책 검토 뒤에). 쓸 때: rewardedPrepare() 로 미리 받고,
     rewardedReady() 가 true 일 때 rewardedShow().then(function (earned) {...}) — 끝까지 봐서 보상을 받았으면 true */
  var RW = { ready: false, readyAt: 0, req: false, using: "admob", resolve: null, earned: false };
  function rwFinish() {
    var r = RW.resolve, e = RW.earned;
    RW.resolve = null; RW.earned = false; RW.ready = false; RW.req = false; S.isShowing = false;
    if (S.bannerWant) banner(true);
    if (r) r(e);
  }
  function rewardedPrepare() {
    if (RW.ready && Date.now() - RW.readyAt > AD_TTL) { RW.ready = false; RW.req = false; }   /* 오래된 광고는 버리고 새로 */
    if (!NATIVE || RW.req || RW.ready || noFallback("rewarded")) return Promise.resolve();
    RW.req = true;
    return init().then(function (ok) {
      if (!ok) { RW.req = false; return; }
      if (useMeta("rewarded")) {
        var M = PL("MetaAds"); RW.using = "meta";
        return metaInit().then(function (mok) {
          if (!mok) { RW.req = false; return; }
          if (!RW.ml) {
            RW.ml = true;
            M.addListener("rewardedLoaded", function () { RW.ready = true; RW.readyAt = Date.now(); });
            M.addListener("rewardedEarned", function () { RW.earned = true; });
            M.addListener("rewardedClosed", function () { rwFinish(); });
            M.addListener("rewardedFailed", function () { RW.req = false; RW.ready = false; });
          }
          return M.loadRewarded({ placementId: metaId("rewarded") }).catch(function () { RW.req = false; });
        });
      }
      var A = PL("AdMob"); if (!A) { RW.req = false; return; }
      RW.using = "admob";
      if (!RW.al) {
        RW.al = true;
        A.addListener("onRewardedVideoAdLoaded", function () { RW.ready = true; RW.readyAt = Date.now(); });
        A.addListener("onRewardedVideoAdReward", function () { RW.earned = true; });
        A.addListener("onRewardedVideoAdDismissed", function () { rwFinish(); });
        A.addListener("onRewardedVideoAdFailedToShow", function () { rwFinish(); });
        A.addListener("onRewardedVideoAdFailedToLoad", function () { RW.req = false; RW.ready = false; });
      }
      return A.prepareRewardVideoAd({ adId: TEST[PLAT].rewarded, isTesting: true }).catch(function () { RW.req = false; });
    });
  }
  function canReward() { return NATIVE && !noFallback("rewarded"); }   /* 이 형식의 광고를 보여줄 수 있는가(없으면 화면에서 광고 없이 풀어 준다) */
  function rewardedReady() { return !!RW.ready && Date.now() - RW.readyAt <= AD_TTL; }
  function rewardedShow() {
    return new Promise(function (resolve) {
      if (!rewardedReady() || S.showing || S.isShowing) { resolve(false); return; }
      RW.resolve = resolve; RW.earned = false; S.isShowing = true;
      var P = RW.using === "meta" ? PL("MetaAds").showRewarded() : PL("AdMob").showRewardVideoAd();
      P.catch(function () { rwFinish(); });
    });
  }
  /* 첫 실행: 광고가 준비될 때까지 최대 5초만 기다린다. 못 받으면 그냥 앱을 보여준다 */
  function launch(done) {
    if (!NATIVE || !aoAllowed("launch")) { done(false); return; }   /* 광고를 띄우지 않을 때는 기다리지 않고 바로 앱을 보여준다 */
    openLoad();   /* 이미 요청 중이면 아무 일도 안 한다 */
    var t0 = Date.now();
    (function poll() {
      openShow("launch").then(function (shown) {
        var now = Date.now();
        if (shown || (S.olStartAt && now - S.olStartAt > 5000) || now - t0 > 8000) { done(shown); return; }   /* 요청 후 5초, 전체 8초가 한계 */
        setTimeout(poll, 300);
      });
    })();
  }
  /* 앱이 백그라운드에서 30분 넘게 있다가 돌아오면 다시 */
  var AppP = PL("App");
  if (NATIVE && AppP && AppP.addListener) {
    AppP.addListener("appStateChange", function (st) {
      if (!st.isActive) { S.bgAt = Date.now(); return; }
      /* 돌아왔을 때: 오래 나가 있었고, 사용자가 입력·상세를 보는 중이 아닐 때만 */
      if (Date.now() - S.bgAt > (TESTING ? 10000 : num(S.aoCfg.resumeAfterMin, 30) * 60000) && S.canShow() && aoAllowed("resume")) openShow("resume");
    });
  }

  function setAppOpen(cfg, canShow) { if (cfg) for (var k in cfg) S.aoCfg[k] = cfg[k]; if (canShow) S.canShow = canShow; }
  window.Ads = { native: NATIVE, banner: banner, launch: launch, init: init, setProvider: setProvider, setInterstitial: setInterstitial, setAppOpen: setAppOpen, viewDone: viewDone, rewardedPrepare: rewardedPrepare, rewardedReady: rewardedReady, canReward: canReward, rewardedShow: rewardedShow };
  var aoOk = false; try { aoOk = localStorage.getItem("ad_noao") === "0"; } catch (e) {}   /* 지난 실행에서 "시작 광고 허용"이 확인된 경우에만 미리 받는다 */
  if (NATIVE && aoOk) openLoad();   /* 앱이 켜지자마자 광고 요청을 시작해 첫 화면에서 바로 보여줄 수 있게 한다 */
})();
