/**
 * @OnlyCurrentDoc
 */
/**
 * 法楽寺おみくじ実行回数＋仏様検索訪問回数の共通集計（Google スプレッドシートに紐づく Apps Script）。
 * 取得する情報: 記録時刻（JST）・年・年月・ランダムイベントIDのみ。
 * type=draw は従来の events、type=search_visit は新しい search_events に書き込む。
 * 管理者の数字は公開しない。スプレッドシートの共有を「制限付き」にすること。
 */
const EVENTS_SHEET_NAME = 'events';
const SUMMARY_SHEET_NAME = 'summary';
const SEARCH_EVENTS_SHEET_NAME = 'search_events';
const REPORT_TIMEZONE = 'Asia/Tokyo';

/** 初回だけスプレッドシートの Apps Script 画面から手動で実行する。 */
function initializeOmikujiAnalytics() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Googleスプレッドシートに紐づくApps Scriptとして作成してください。');
  const events = ss.getSheetByName(EVENTS_SHEET_NAME) || ss.insertSheet(EVENTS_SHEET_NAME);
  if (events.getLastRow() === 0) {
    events.appendRow(['日時（JST）', '年月', '年', 'イベントID']);
  }
  events.setFrozenRows(1);

  const summary = ss.getSheetByName(SUMMARY_SHEET_NAME) || ss.insertSheet(SUMMARY_SHEET_NAME);
  summary.getRange('A1:B4').setValues([
    ['項目', '引いた回数'],
    ['累計', '=COUNTA(events!A2:A)'],
    ['当月', '=COUNTIF(events!B2:B,TEXT(TODAY(),"yyyy-mm"))'],
    ['当年', '=COUNTIF(events!C2:C,YEAR(TODAY()))']
  ]);
  summary.setFrozenRows(1);
  summary.getRange('A1:B1').setFontWeight('bold');
  summary.autoResizeColumns(1, 2);
}

/** 公開サイトからの記録専用。集計数を返すGET APIは実装しない。 */
function doPost(e) {
  try {
    const text = e && e.postData ? e.postData.contents : '';
    if (typeof text !== 'string' || text.length < 10 || text.length > 512) {
      return response_({ ok: false, reason: 'invalid_body' });
    }
    const request = JSON.parse(text);
    if ((request.type !== 'draw' && request.type !== 'search_visit') ||
        typeof request.eventId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.eventId)) {
      return response_({ ok: false, reason: 'invalid_event' });
    }

    // 同時到達時の重複記録と競合を抑える。
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return response_({ ok: false, reason: 'busy' });
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const targetSheetName = request.type === 'search_visit' ? SEARCH_EVENTS_SHEET_NAME : EVENTS_SHEET_NAME;
      const sheet = ss && ss.getSheetByName(targetSheetName);
      if (!sheet) return response_({ ok: false, reason: 'not_initialized' });

      const last = sheet.getLastRow();
      if (last > 1) {
        const found = sheet.getRange(2, 4, last - 1, 1)
          .createTextFinder(request.eventId).matchEntireCell(true).findNext();
        if (found) return response_({ ok: true, duplicate: true });
      }

      const now = new Date();
      const timestamp = Utilities.formatDate(now, REPORT_TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
      const month = Utilities.formatDate(now, REPORT_TIMEZONE, 'yyyy-MM');
      const year = Number(Utilities.formatDate(now, REPORT_TIMEZONE, 'yyyy'));
      sheet.appendRow([timestamp, month, year, request.eventId]);
      SpreadsheetApp.flush();
      return response_({ ok: true });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error('集計保存エラー: ' + error);
    return response_({ ok: false, reason: 'server_error' });
  }
}

function response_(body) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
