// =================================================================
// 本人確認(なりすまし対策)の共通部品。6つのページ(と勤怠)で読み込む。
// GASへはLINEの本人証明書(IDトークン)を付けて送る。GASは証明書をLINEに確かめ、
// その中のLINE IDだけを使う(GAS側は reception-back の 本人確認.js)。
// GASから「本人確認できない」(期限切れなど)と返ってきたら、LINEに入り直して新しい証明書をもらう。
// マナサポ(manasapo1-front)と同じ動き。
// =================================================================

// 2026-11-15 段階2: ホーム画面アプリ「RM」から開いたとき(rm-app.js の AppAuth.isAppMode())だけ、
// 本人証明書の代わりに端末の鍵(appToken)を付ける。LINEの中・Safariから開いたときは今までどおり。
function rmIsAppMode() {
    return typeof AppAuth !== "undefined" && AppAuth.isAppMode();
}

// payload に本人証明書を付ける(LIFFの scope に openid が無いと null になる)
function withIdToken(payload) {
    if (rmIsAppMode()) {
        payload.appToken = AppAuth.getToken();
        payload.idToken = null;
        payload.entry = "app";
        return payload;
    }
    try { payload.idToken = liff.getIDToken(); } catch (e) { payload.idToken = null; }
    payload.entry = (typeof liff !== "undefined" && liff.isInClient && liff.isInClient()) ? "line" : "browser";
    return payload;
}

// GASへ POST で送る。data=(JSON) の形にすると、ブラウザの事前確認(CORS)が起きず、GASでも受けられる
function postToGas(url, payload) {
    const body = new URLSearchParams();
    body.append("data", JSON.stringify(withIdToken(payload)));
    return fetch(url, { method: "POST", body: body });
}

// GASから auth_error が返ってきたら true を返し、LINEに入り直す
function isAuthError(data) {
    if (data && data.status === "auth_error") {
        // 呼び出し元の後片付け(ボタンを戻す等)が終わってから動かすため、少し後で実行する
        if (rmIsAppMode()) {
            // ホーム画面アプリ: 端末の連携が切れた(アプリ連携シートの行が消された等) → 連携し直す
            setTimeout(function () {
                alert("この端末の連携が切れました。もう一度「LINEと連携する」を押してください。");
                AppAuth.relink();
            }, 0);
        } else {
            setTimeout(reauthLine, 0);
        }
        return true;
    }
    return false;
}

// 画面を閉じる。LINEの中では今までどおり閉じ、ホーム画面アプリではトップページ(7つのボタン)に戻る
function rmCloseWindow() {
    if (rmIsAppMode()) { location.href = "./"; return; }
    liff.closeWindow();
}

// LINEに入り直して新しい本人証明書を取る
function reauthLine() {
    // 何度も開き直しを繰り返さないよう、1分以内の2回目はお知らせを出して止める
    let last = 0;
    try { last = Number(sessionStorage.getItem("reauthAt") || 0); } catch (e) {}
    if (Date.now() - last < 60000) {
        alert("LINEの本人確認ができませんでした。画面を閉じて、リッチメニューからもう一度開いてください。");
        return;
    }
    try { sessionStorage.setItem("reauthAt", String(Date.now())); } catch (e) {}

    if (liff.isInClient()) {
        // LINEの中:LIFFを開き直すと新しい証明書がもらえる
        location.href = "https://liff.line.me/" + liff.id;
    } else {
        // ブラウザ:いったんログアウトしてログインし直す
        liff.logout();
        liff.login({ redirectUri: location.href });
    }
}
