const SPREADSHEET_ID = '1oXwz2zznkpY10M5GumIET6E96TjEEMd3jISM4FUy2f0';
const TARGET_SHEET_GID = 1831701351;
const ECONOMICS_SHEET_NAME = 'Экономика';
const CUSTOMERS_SHEET_NAME = 'Покупатели';

const ORDER_HEADERS = [
  'order_id',
  'user_id',
  'username',
  'first_name',
  'last_name',
  'created_at',
  'status',
  'payment_status',
  'paid_total',
  'paid_at',
  'items_summary',
  'cart_snapshot',
  'subtotal',
  'delivery_name',
  'delivery_cost',
  'total',
  'promo_code',
  'promo_discount',
  'bargain_discount',
  'loyalty_discount',
  'priority_fee',
  'priority_enabled',
  'comment',
];

function doGet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const ordersSheet = getOrdersSheet_(spreadsheet);

  ensureOrdersHeader_(ordersSheet);
  syncEconomicsSheet_(spreadsheet, ordersSheet);
  syncCustomersSheet_(spreadsheet, ordersSheet);

  return jsonResponse_({ ok: true, mode: 'GET', message: 'Orders webhook is alive' });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const ordersSheet = getOrdersSheet_(spreadsheet);

    ensureOrdersHeader_(ordersSheet);

    const row = [
      payload.orderId || '',
      payload.userId || '',
      payload.username || '',
      payload.firstName || '',
      payload.lastName || '',
      payload.createdAt || '',
      payload.status || 'checkout_clicked',
      payload.paymentStatus || 'пендинг',
      payload.paidTotal || '',
      payload.paidAt || '',
      payload.itemsSummary || '',
      payload.cartSnapshot || '',
      payload.subtotal || 0,
      payload.deliveryName || '',
      payload.deliveryCost || 0,
      payload.total || 0,
      payload.promoCode || '',
      payload.promoDiscount || 0,
      payload.bargainDiscount || 0,
      payload.loyaltyDiscount || 0,
      payload.priorityFee || 0,
      payload.priorityEnabled ? 'true' : 'false',
      payload.comment || '',
    ];

    ordersSheet.appendRow(row);
    syncEconomicsSheet_(spreadsheet, ordersSheet);
    syncCustomersSheet_(spreadsheet, ordersSheet);

    return jsonResponse_({ ok: true });
  } catch (error) {
    return jsonResponse_({ ok: false, error: String(error) });
  }
}

function getOrdersSheet_(spreadsheet) {
  const sheet = spreadsheet.getSheets().find((item) => item.getSheetId() === TARGET_SHEET_GID);

  if (!sheet) {
    throw new Error('Target sheet not found');
  }

  return sheet;
}

function ensureOrdersHeader_(sheet) {
  const currentHeader = sheet.getRange(1, 1, 1, ORDER_HEADERS.length).getValues()[0];
  const normalizedCurrent = currentHeader.map((value) => String(value || '').trim());

  if (normalizedCurrent.join('|') !== ORDER_HEADERS.join('|')) {
    sheet.getRange(1, 1, 1, ORDER_HEADERS.length).setValues([ORDER_HEADERS]);
  }

  const paymentStatusColumn = ORDER_HEADERS.indexOf('payment_status') + 1;
  const paidTotalColumn = ORDER_HEADERS.indexOf('paid_total') + 1;
  const paidAtColumn = ORDER_HEADERS.indexOf('paid_at') + 1;
  const maxRows = Math.max(sheet.getMaxRows() - 1, 1);

  const paymentStatusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['пендинг', 'оплата', 'отказ', 'pending', 'paid', 'declined'], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(2, paymentStatusColumn, maxRows, 1).setDataValidation(paymentStatusRule);
  sheet.getRange(2, paidTotalColumn, maxRows, 1).setNumberFormat('#,##0');
  sheet.getRange(2, paidAtColumn, maxRows, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.setFrozenRows(1);
}

function syncEconomicsSheet_(spreadsheet, ordersSheet) {
  const sheetName = ordersSheet.getName().replace(/'/g, "\\'");
  const paymentStatusCol = columnLetter_(ORDER_HEADERS.indexOf('payment_status') + 1);
  const paidAtCol = columnLetter_(ORDER_HEADERS.indexOf('paid_at') + 1);
  const paidTotalCol = columnLetter_(ORDER_HEADERS.indexOf('paid_total') + 1);
  const orderIdCol = columnLetter_(ORDER_HEADERS.indexOf('order_id') + 1);
  const userIdCol = columnLetter_(ORDER_HEADERS.indexOf('user_id') + 1);
  const usernameCol = columnLetter_(ORDER_HEADERS.indexOf('username') + 1);
  const createdAtCol = columnLetter_(ORDER_HEADERS.indexOf('created_at') + 1);
  const totalCol = columnLetter_(ORDER_HEADERS.indexOf('total') + 1);
  const economicsSheet = spreadsheet.getSheetByName(ECONOMICS_SHEET_NAME) || spreadsheet.insertSheet(ECONOMICS_SHEET_NAME);

  economicsSheet.clear();

  economicsSheet.getRange('A1').setValue('Экономика заказов');
  economicsSheet.getRange('A1').setFontWeight('bold').setFontSize(14);

  economicsSheet.getRange('A3').setValue('Показатель');
  economicsSheet.getRange('B3').setValue('Значение');
  economicsSheet.getRange('A3:B3').setFontWeight('bold');

  economicsSheet.getRange('A4').setValue('Всего оформлено');
  economicsSheet.getRange('B4').setFormula(`=MAX(COUNTA('${sheetName}'!A:A)-1,0)`);

  economicsSheet.getRange('A5').setValue('Реально оплачено');
  economicsSheet.getRange('B5').setFormula(`=COUNTIF('${sheetName}'!${paymentStatusCol}:${paymentStatusCol},"paid")+COUNTIF('${sheetName}'!${paymentStatusCol}:${paymentStatusCol},"оплата")+COUNTIF('${sheetName}'!${paymentStatusCol}:${paymentStatusCol},"оплачено")`);

  economicsSheet.getRange('A6').setValue('Ожидают оплату');
  economicsSheet.getRange('B6').setFormula(`=COUNTIF('${sheetName}'!${paymentStatusCol}:${paymentStatusCol},"pending")+COUNTIF('${sheetName}'!${paymentStatusCol}:${paymentStatusCol},"пендинг")`);

  economicsSheet.getRange('A7').setValue('Не дошли / отменены');
  economicsSheet.getRange('B7').setFormula(`=COUNTIF('${sheetName}'!${paymentStatusCol}:${paymentStatusCol},"declined")+COUNTIF('${sheetName}'!${paymentStatusCol}:${paymentStatusCol},"отказ")+COUNTIF('${sheetName}'!${paymentStatusCol}:${paymentStatusCol},"cancelled")`);

  economicsSheet.getRange('A8').setValue('Оплачено денег');
  economicsSheet.getRange('B8').setFormula(`=SUM('${sheetName}'!${paidTotalCol}:${paidTotalCol})`);

  economicsSheet.getRange('A9').setValue('Средний оплаченный чек');
  economicsSheet.getRange('B9').setFormula(`=IFERROR(AVERAGE(FILTER('${sheetName}'!${paidTotalCol}:${paidTotalCol},('${sheetName}'!${paymentStatusCol}:${paymentStatusCol}="paid")+('${sheetName}'!${paymentStatusCol}:${paymentStatusCol}="оплата")+('${sheetName}'!${paymentStatusCol}:${paymentStatusCol}="оплачено"))),0)`);

  economicsSheet.getRange('A11').setValue('Оплаченные заказы');
  economicsSheet.getRange('A11:E11').setValues([['order_id', 'user_id', 'username', 'paid_at', 'paid_total']]);
  economicsSheet.getRange('A11:E11').setFontWeight('bold');
  economicsSheet.getRange('A12').setFormula(
    `=IFERROR(FILTER({'${sheetName}'!${orderIdCol}:${orderIdCol},'${sheetName}'!${userIdCol}:${userIdCol},'${sheetName}'!${usernameCol}:${usernameCol},'${sheetName}'!${paidAtCol}:${paidAtCol},'${sheetName}'!${paidTotalCol}:${paidTotalCol}},('${sheetName}'!${paymentStatusCol}:${paymentStatusCol}="paid")+('${sheetName}'!${paymentStatusCol}:${paymentStatusCol}="оплата")+('${sheetName}'!${paymentStatusCol}:${paymentStatusCol}="оплачено")),"")`
  );

  economicsSheet.getRange('G11').setValue('Оформлены, но не оплачены');
  economicsSheet.getRange('G11:K11').setValues([['order_id', 'user_id', 'username', 'created_at', 'total']]);
  economicsSheet.getRange('G11:K11').setFontWeight('bold');
  economicsSheet.getRange('G12').setFormula(
    `=IFERROR(FILTER({'${sheetName}'!${orderIdCol}:${orderIdCol},'${sheetName}'!${userIdCol}:${userIdCol},'${sheetName}'!${usernameCol}:${usernameCol},'${sheetName}'!${createdAtCol}:${createdAtCol},'${sheetName}'!${totalCol}:${totalCol}},('${sheetName}'!${paymentStatusCol}:${paymentStatusCol}="pending")+('${sheetName}'!${paymentStatusCol}:${paymentStatusCol}="пендинг")),"")`
  );

  economicsSheet.autoResizeColumns(1, 11);
}

function syncCustomersSheet_(spreadsheet, ordersSheet) {
  const customersSheet = spreadsheet.getSheetByName(CUSTOMERS_SHEET_NAME) || spreadsheet.insertSheet(CUSTOMERS_SHEET_NAME);
  const data = ordersSheet.getDataRange().getValues();
  const rows = data.slice(1);
  const paidStatusIndex = ORDER_HEADERS.indexOf('payment_status');
  const userIdIndex = ORDER_HEADERS.indexOf('user_id');
  const usernameIndex = ORDER_HEADERS.indexOf('username');
  const firstNameIndex = ORDER_HEADERS.indexOf('first_name');
  const lastNameIndex = ORDER_HEADERS.indexOf('last_name');
  const paidAtIndex = ORDER_HEADERS.indexOf('paid_at');
  const createdAtIndex = ORDER_HEADERS.indexOf('created_at');

  const customersMap = {};

  rows.forEach((row) => {
    const paymentStatus = String(row[paidStatusIndex] || '').trim().toLowerCase();
    const userId = String(row[userIdIndex] || '').trim();

    if (!['paid', 'оплата', 'оплачено'].includes(paymentStatus) || !userId) {
      return;
    }

    const username = String(row[usernameIndex] || '').trim();
    const firstName = String(row[firstNameIndex] || '').trim();
    const lastName = String(row[lastNameIndex] || '').trim();
    const paidAt = String(row[paidAtIndex] || row[createdAtIndex] || '').trim();

    if (!customersMap[userId]) {
      customersMap[userId] = {
        userId,
        username,
        firstName,
        lastName,
        confirmedPurchases: 0,
        lastConfirmedPurchaseAt: paidAt,
      };
    }

    customersMap[userId].confirmedPurchases += 1;

    if (paidAt && (!customersMap[userId].lastConfirmedPurchaseAt || paidAt > customersMap[userId].lastConfirmedPurchaseAt)) {
      customersMap[userId].lastConfirmedPurchaseAt = paidAt;
    }
  });

  const customerRows = Object.values(customersMap)
    .sort((left, right) => right.confirmedPurchases - left.confirmedPurchases || String(right.lastConfirmedPurchaseAt).localeCompare(String(left.lastConfirmedPurchaseAt)))
    .map((customer) => [
      customer.userId,
      customer.username,
      customer.firstName,
      customer.lastName,
      customer.confirmedPurchases,
      customer.lastConfirmedPurchaseAt,
    ]);

  customersSheet.clear();
  customersSheet.getRange('A1').setValue('Покупатели');
  customersSheet.getRange('A1').setFontWeight('bold').setFontSize(14);
  customersSheet.getRange('A3:F3').setValues([[
    'user_id',
    'username',
    'first_name',
    'last_name',
    'confirmed_purchases',
    'last_confirmed_purchase_at',
  ]]);
  customersSheet.getRange('A3:F3').setFontWeight('bold');

  if (customerRows.length > 0) {
    customersSheet.getRange(4, 1, customerRows.length, 6).setValues(customerRows);
  }

  customersSheet.autoResizeColumns(1, 6);
}

function columnLetter_(columnNumber) {
  let temp = columnNumber;
  let letter = '';

  while (temp > 0) {
    const remainder = (temp - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    temp = Math.floor((temp - remainder - 1) / 26);
  }

  return letter;
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
