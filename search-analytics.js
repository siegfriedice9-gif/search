/* 法楽寺 仏様検索システム｜匿名・訪問回数の記録（同一ブラウザータブにつき1回）
 * 記録先: おみくじと共通のGoogleスプレッドシートの search_events タブ。
 * 保存データ: サーバー側記録時刻(JST)、年月、年、今回だけのランダムイベントID。
 * 氏名・IPアドレス・検索内容・固定の利用者ID・Cookieは送信データに含めない。
 *
 * 注意: Apps Script の doPost が type:'search_visit' に対応した版へ
 * 再デプロイされるまでは保存されません。no-cors では成否を判定できません。
 */
(function () {
  'use strict';

  const ENDPOINT = 'https://script.google.com/macros/s/AKfycbyOABbtzt0A7VcBPNnkjuF_ebw1YCqtq367fzJmKT89aIClYHVo_Q--Jt5FoBENK2aL/exec';
  const KEY = 'horakuji_search_visit_recorded_v1';

  function newEventId() {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' +
      hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function recordVisit() {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(ENDPOINT)) return;
    try {
      if (window.sessionStorage.getItem(KEY)) return;
      const eventId = newEventId();
      // 同じタブで再読込しても重複計数しない。
      window.sessionStorage.setItem(KEY, eventId);
      fetch(ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'search_visit', eventId }),
        keepalive: true
      }).catch(function () {
        // 通信エラー時は次の再読込で再試行（イベントIDは同じなので重複はサーバーで除去）。
        try { window.sessionStorage.removeItem(KEY); } catch (ignored) {}
      });
    } catch (error) {
      // 保存領域の制限などで失敗しても検索機能には影響を与えない。
      console.warn('訪問回数の記録を省略しました', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', recordVisit, { once: true });
  } else {
    recordVisit();
  }
})();
