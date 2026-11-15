// =================================================================
// rm-app.js:ホーム画面のアプリ「RM」用の設定と、本人確認(連携)の部品  2026-11-15 店舗担当ターニャ
//
// 【なぜ必要か】(マナサポ manasapo1-front の app-auth.js と同じ仕組み)
//   iPhoneのホーム画面アプリは、LINEログインの画面に移るとSafariに飛んでしまい、
//   ログインした記録がアプリ側に残らない。そこで最初の1回だけ「連携」して、
//   以後はこの端末専用の鍵(appToken)をGASに送って本人を確かめてもらう。
//
// 【流れ】(GAS側は reception-back の kintai/コード.js)
//   1. トップページ(index.html)で「LINEと連携する」→ 合言葉と鍵を作り、LINEで連携ページを開く
//   2. 連携ページ(kintai.html?link=合言葉。勤怠のLIFF)でLINEの本人確認をし、GASに合言葉を届ける
//   3. アプリに戻ると、GASに問い合わせて連携完了 → 鍵をこの端末に保存
//      (GASは鍵のハッシュとLINE IDを RMマスターデータの「アプリ連携」シートに記録する)
//
// ・LINEのリッチメニューから開いたときは、これまでどおりLIFF(LINEログイン)を使う。
//   この部品が働くのは「ホーム画面から全画面で開いたとき」だけ。
// ・今の6画面(uketuke など)も 2026-11-15 段階2でこの部品を読み込むようにした。
//   ホーム画面から開いたときだけ、rm-auth.js が鍵を付けて送る。LINEの中では今までどおりLIFF。
// =================================================================
const RM_APP = {
    // 勤怠のGAS(連携の受付も兼ねる)
    KINTAI_GAS_URL: "https://script.google.com/macros/s/AKfycbzEkPHBAvr44Rb4yF6swlaxyJQVHKZuPAFB9HO0N50xvDuDXUS3Sqa4vTT6ry6gY3XK/exec",
    // 勤怠のLIFF(エンドポイント kintai.html。11/15 新井さんが足した)
    KINTAI_LIFF_ID: "2010292787-8c2mK2Yx",
    // 今の6画面のLIFF(段階1では、トップページのボタンからLINEで開く)
    LIFF: {
        uketuke: "2010292787-nAxhQtMo",       // 受付票保存
        raitenrireki: "2010292787-THrXgcKd",  // 顧客履歴検索
        genkin: "2010292787-0qdirwvb",        // 現金出納帳
        shukei: "2010292787-uHHgSxXo",        // グラフ
        summary: "2010292787-ZmmtDZh0",       // サマリー
        forauction: "2010292787-FQhvWvUm"     // ヤフオク分析
    }
};

const AppAuth = (() => {
    const LINK_VALID_MS = 10 * 60 * 1000; // 合言葉の有効時間(GAS側も10分)
    const KEY_TOKEN = "rmApp.appToken";
    const KEY_LINE_ID = "rmApp.lineId";
    const KEY_PENDING = "rmApp.pendingLink";

    function load(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
    function save(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
    function remove(key) { try { localStorage.removeItem(key); } catch (e) {} }

    // ホーム画面のアイコンから(全画面で)開いているか
    function isStandalone() {
        return window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    }
    function isInLine() { return /Line\//i.test(navigator.userAgent); }

    function getToken() { return load(KEY_TOKEN); }
    function getLineId() { return load(KEY_LINE_ID); }
    function isAppMode() { return isStandalone() && !!getToken(); }

    /**
     * 機能ページの最初に呼ぶ。
     *  {mode:"liff"}         … LINE・Safariから開いた。これまでどおりLIFFで続ける
     *  {mode:"app"}          … ホーム画面から開いて連携済み。LIFFは使わない
     *  {mode:"redirect"}     … ホーム画面から開いたが未連携。トップページ(連携画面)へ移動した
     */
    function startPage() {
        if (!isStandalone()) return { mode: "liff" };
        if (!getToken()) { location.replace("./"); return { mode: "redirect" }; }
        return { mode: "app", lineId: getLineId() };
    }

    // ホーム画面アプリには戻るボタンが無いので、左上に「‹ メニュー」を出す(今の6画面用)。
    // <button> にしないこと(現金出納帳は document.querySelector('button') で送信ボタンを探しているため)
    function showBackLink() {
        const a = document.createElement("a");
        a.href = "./";
        a.textContent = "‹ メニュー";
        a.setAttribute("aria-label", "RMのメニューに戻る");
        a.style.cssText = "position:fixed;left:10px;top:calc(8px + env(safe-area-inset-top));z-index:99999;" +
            "background:rgba(31,58,95,.92);color:#fff;font:bold 14px/1 -apple-system,'Hiragino Sans',sans-serif;" +
            "padding:9px 12px;border-radius:18px;text-decoration:none;box-shadow:0 1px 4px rgba(0,0,0,.25);";
        // ボタンが画面の見出しに重ならないよう、ページの頭に同じ高さの余白を入れる(ホーム画面から開いたときだけ)
        const spacer = document.createElement("div");
        spacer.style.cssText = "height:calc(44px + env(safe-area-inset-top));";
        const add = function () { document.body.insertBefore(spacer, document.body.firstChild); document.body.appendChild(a); };
        if (document.body) add(); else document.addEventListener("DOMContentLoaded", add);
    }

    // 鍵が使えなくなったとき(シートから消された等):鍵を消して連携画面へ
    function relink() {
        remove(KEY_TOKEN);
        remove(KEY_LINE_ID);
        location.replace("./");
    }

    function randomHex(bytes) {
        const arr = new Uint8Array(bytes);
        crypto.getRandomValues(arr);
        return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
    }

    function linkLiffUrl(linkCode) {
        return "https://liff.line.me/" + RM_APP.KINTAI_LIFF_ID + "?link=" + linkCode;
    }

    // 連携を始める:合言葉と鍵を作って保存し、LINEで連携ページを開く
    function beginLink() {
        if (!RM_APP.KINTAI_LIFF_ID) { alert("まだ準備中です(勤怠のLIFFが未設定)。"); return null; }
        const pending = { linkCode: randomHex(16), appToken: randomHex(32), startedAt: Date.now() };
        save(KEY_PENDING, JSON.stringify(pending));
        window.open(linkLiffUrl(pending.linkCode), "_blank");
        return pending;
    }

    function getPending() {
        let p = null;
        try { p = JSON.parse(load(KEY_PENDING) || "null"); } catch (e) {}
        if (!p) return null;
        if (Date.now() - p.startedAt > LINK_VALID_MS) { remove(KEY_PENDING); return null; }
        return p;
    }

    /** 戻り値: "linked" / "waiting" / "none"(連携待ちなし・期限切れ) / それ以外はエラー文 */
    async function checkLink() {
        const p = getPending();
        if (!p) return "none";
        const data = await postGas({ action: "link_check", linkCode: p.linkCode, appToken: p.appToken });
        if (data.status === "linked") {
            save(KEY_TOKEN, p.appToken);
            save(KEY_LINE_ID, data.lineId || "");
            remove(KEY_PENDING);
            return "linked";
        }
        if (data.status === "waiting") return "waiting";
        return data.message || "連携に失敗しました。";
    }

    // 連携ページ側:URLから合言葉を取り出す(LIFFの転送で liff.state に入っていることもある)
    function getLinkCodeFromUrl() {
        const params = new URLSearchParams(location.search);
        let code = params.get("link");
        if (!code && params.get("liff.state")) {
            const inner = new URLSearchParams(params.get("liff.state").replace(/^[^?]*\?/, ""));
            code = inner.get("link");
        }
        return (code && /^[0-9a-f]{32}$/.test(code)) ? code : null;
    }

    // 勤怠のGASへ data=(JSON) で送る(ブラウザの事前確認が起きない形)
    async function postGas(payload) {
        const body = new URLSearchParams();
        body.append("data", JSON.stringify(payload));
        const res = await fetch(RM_APP.KINTAI_GAS_URL, { method: "POST", body: body });
        return res.json();
    }

    return { isStandalone, isInLine, isAppMode, getToken, getLineId, startPage, showBackLink, relink,
             beginLink, getPending, checkLink, getLinkCodeFromUrl, postGas };
})();
