const SPREADSHEET_ID = '1oXwz2zznkpY10M5GumIET6E96TjEEMd3jISM4FUy2f0';
const TARGET_SHEET_GID = 1831701351;

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheets().find((item) => item.getSheetId() === TARGET_SHEET_GID);

    if (!sheet) {
      return jsonResponse({ ok: false, error: 'Target sheet not found' });
    }

    const row = [
      payload.orderId || '',
      payload.userId || '',
      payload.username || '',
      payload.firstName || '',
      payload.lastName || '',
      payload.createdAt || '',
      payload.status || '',
      payload.paymentStatus || '',
      payload.paidAt || '',
      payload.itemsSummary || '',
      payload.cartSnapshot || '',
      payload.subtotal || 0,
      payload.deliveryName || '',
      payload.deliveryCost || 0,
      payload.total || 0,
      payload.paidTotal || '',
      payload.promoCode || '',
      payload.promoDiscount || 0,
      payload.bargainDiscount || 0,
      payload.loyaltyDiscount || 0,
      payload.priorityFee || 0,
      payload.priorityEnabled ? 'true' : 'false',
      payload.comment || '',
    ];

    sheet.appendRow(row);

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) });
  }
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
