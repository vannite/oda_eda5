import Papa from 'papaparse';
import { Product, DeliveryOption, DeliveryTier, PromoCode, LoyaltyRecord, OrderLogPayload, FeedbackPayload } from '../types';

const SHEET_ID = '1oXwz2zznkpY10M5GumIET6E96TjEEMd3jISM4FUy2f0';
const PRODUCTS_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
const DELIVERY_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=115101300`;
const PROMO_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=1982833599`;
const LOYALTY_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=1519224442`;
const ORDERS_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=1831701351`;

const OFFICE_DELIVERY_TIERS: DeliveryTier[] = [
  { price: 100, condition: '0-1 товар', minItems: 0, maxItems: 1 },
  { price: 75, condition: '2 товара', minItems: 2, maxItems: 2 },
  { price: 50, condition: '3-4 товара', minItems: 3, maxItems: 4 },
  { price: 0, condition: 'От 5 товаров', minItems: 5 }
];

async function fetchSheetCsv(apiPath: string, fallbackUrl: string): Promise<string> {
  const cacheBuster = `?_=${Date.now()}`;

  try {
    const response = await fetch(`${apiPath}${cacheBuster}`, {
      cache: 'no-store',
      headers: {
        pragma: 'no-cache',
      },
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();

      if (isValidCsvPayload(text, contentType)) {
        return text;
      }

      console.warn(`API sheet fetch for ${apiPath} returned non-CSV payload, falling back to Google Sheets`);
    }
  } catch (error) {
    console.warn(`API sheet fetch failed for ${apiPath}, falling back to Google Sheets`, error);
  }

  const fallbackResponse = await fetch(`${fallbackUrl}&_=${Date.now()}`, {
    cache: 'no-store',
    headers: {
      pragma: 'no-cache',
    },
  });

  return await fallbackResponse.text();
}

function isValidCsvPayload(payload: string, contentType: string): boolean {
  const normalized = payload.trim().toLowerCase();

  if (!normalized) return false;
  if (contentType.includes('text/html')) return false;
  if (normalized.startsWith('<!doctype') || normalized.startsWith('<html')) return false;
  if (normalized.includes('<body') || normalized.includes('<head')) return false;

  return payload.includes(',') || payload.includes(';') || payload.includes('\n');
}

function normalizeCategory(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (!normalized) return 'другое';
  if (normalized.includes('мяс')) return 'мясо';
  if (normalized.includes('сыр')) return 'сыры';
  if (normalized.includes('олив') || normalized.includes('маслин')) return 'оливки';
  if (normalized.includes('орех') || normalized.includes('фисташ') || normalized.includes('миндал')) return 'орехи';
  if (normalized.includes('снек') || normalized.includes('чипс') || normalized.includes('прингл') || normalized.includes('крекер')) return 'снеки';

  return 'другое';
}

export async function fetchProducts(): Promise<Product[]> {
  try {
    const csvData = await fetchSheetCsv('/api/sheets/products', PRODUCTS_URL);
    const results = Papa.parse(csvData, { header: true });
    
    const products: Product[] = [];
    let currentProduct: Product | null = null;

    results.data.forEach((row: any, index: number) => {
      const name = (row['Наименование'] || row['наименование'] || row['Name'])?.trim();
      const photo = (row['Фото'] || row['фото'] || row['Photo'] || row['Image'])?.trim();
      const weight = (row['Вес в гр'] || row['вес'] || row['Weight'])?.trim();
      const priceStr = (row['Цена'] || row['цена'] || row['Price'])?.toString() || '0';
      const price = parseFloat(priceStr.replace(/[^\d.]/g, '') || '0');
      const description = (row['Описание'] || row['описание'] || row['Description'])?.trim() || '';
      const category = normalizeCategory(
        (row['категория'] || row['Категория'] || row['category'] || row['Category'])?.toString() || ''
      );

      if (name && photo) {
        currentProduct = {
          id: `prod-${index}`,
          name: name,
          description: description, 
          image: photo,
          category,
          weights: [{ weight, price }]
        };
        products.push(currentProduct);
      } else if (currentProduct && weight && price) {
        currentProduct.weights.push({ weight, price });
      }
    });

    return products;
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

export async function fetchDeliveryOptions(): Promise<DeliveryOption[]> {
  try {
    const csvData = await fetchSheetCsv('/api/sheets/delivery', DELIVERY_URL);
    const results = Papa.parse(csvData, { header: false });
    const rows = results.data as string[][];

    if (rows.length === 0) throw new Error('Empty delivery sheet');

    const dataRows = rows
      .map((row) => row.map((cell) => cell?.toString().trim() || ''))
      .filter((row) => row.some(Boolean))
      .slice(1);

    const individualCell = dataRows.find((row) => row[0])?.[0] || '';
    const individualPrice = parsePrice(individualCell);
    const officeCondition = OFFICE_DELIVERY_TIERS
      .map((tier) => `${tier.condition}: ${tier.price}р`)
      .join(' | ');

    return [
      {
        id: 'delivery-office',
        name: 'Тверская, 22',
        price: OFFICE_DELIVERY_TIERS[0].price,
        type: 'delivery',
        condition: officeCondition,
        tiers: OFFICE_DELIVERY_TIERS
      },
      {
        id: 'pickup-rokossovskogo',
        name: 'Самовывоз',
        price: 0,
        type: 'pickup',
        condition: 'По будням после 22:00 • м. Бульвар Рокоссовского'
      },
      {
        id: 'delivery-indiv',
        name: 'Индивидуальная',
        price: individualPrice,
        type: 'delivery',
        condition: individualCell || 'от 500р'
      }
    ];
  } catch (error) {
    console.error('Error fetching delivery options:', error);
    return [
      {
        id: 'default-office',
        name: 'Тверская, 22',
        price: OFFICE_DELIVERY_TIERS[0].price,
        type: 'delivery',
        condition: '0-1 товар: 100р | 2 товара: 75р | 3-4 товара: 50р | от 5 товаров: 0р',
        tiers: OFFICE_DELIVERY_TIERS
      },
      {
        id: 'default-pickup',
        name: 'Самовывоз',
        price: 0,
        type: 'pickup',
        condition: 'По будням после 22:00 • м. Бульвар Рокоссовского'
      },
      { id: 'default-indiv', name: 'Индивидуальная', price: 150, type: 'delivery', condition: 'от 500р' }
    ];
  }
}

function parsePrice(value: string): number {
  return parseFloat(value.replace(/[^\d.,]/g, '').replace(',', '.') || '0');
}

function parseNumber(value: unknown): number {
  return parseFloat(String(value ?? '').replace(/[^\d.,-]/g, '').replace(',', '.') || '0');
}

function getNormalizedField(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }

  return '';
}

function isPaidStatus(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return ['paid', 'оплата', 'оплачено', 'оплачен', 'paid_manual', 'confirmed_paid', 'зачислено'].includes(normalized);
}

export async function fetchPromoCodes(): Promise<PromoCode[]> {
  try {
    const csvData = await fetchSheetCsv('/api/sheets/promo', PROMO_URL);
    // Parse without headers to access columns A and B directly
    const results = Papa.parse(csvData, { header: false });
    const rows = results.data as string[][];
    
    return rows
      .filter(row => row[0] && row[1])
      .map(row => {
        const code = row[0].trim();
        const discountStr = row[1].toString();
        const discount = parseFloat(discountStr.replace(/[^\d.]/g, '') || '0');
        // If it's in Col B as a percentage, we treat it as percent
        const type: 'percent' = 'percent'; 

        return { code, discount, type };
      })
      .filter(p => p.code !== '' && !isNaN(p.discount));
  } catch (error) {
    console.error('Error fetching promo codes:', error);
    return [];
  }
}

export async function fetchLoyaltyData(): Promise<LoyaltyRecord[]> {
  try {
    const ordersCsvData = await fetchSheetCsv('/api/sheets/orders', ORDERS_URL);
    const orderResults = Papa.parse(ordersCsvData, { header: true });

    const orderRecords = orderResults.data
      .map((row: any) => {
        const userId = getNormalizedField(row, ['user_id', 'User ID', 'ID', 'id', 'айди']);
        const paymentStatus = getNormalizedField(row, ['payment_status', 'Payment Status', 'Статус оплаты', 'оплата']);
        const amount = parseNumber(
          getNormalizedField(row, ['paid_total', 'Paid Total', 'loyalty_base_amount', 'Loyalty Base Amount', 'total', 'Total', 'Сумма'])
        );
        const paidAt = getNormalizedField(row, ['paid_at', 'Paid At', 'Дата оплаты', 'date', 'Дата']) || new Date().toISOString();

        return { userId, paymentStatus, amount, paidAt };
      })
      .filter((row: any) => row.userId && isPaidStatus(row.paymentStatus) && row.amount > 0)
      .map((row: any) => ({
        userId: row.userId,
        amount: row.amount,
        date: row.paidAt,
      }));

    if (orderRecords.length > 0) {
      return orderRecords;
    }
  } catch (error) {
    console.warn('Orders sheet loyalty fallback failed, using legacy loyalty sheet', error);
  }

  try {
    const csvData = await fetchSheetCsv('/api/sheets/loyalty', LOYALTY_URL);
    const results = Papa.parse(csvData, { header: true });
    
    return results.data
      .filter((row: any) => (row['ID'] || row['id'] || row['айди']) && (row['Сумма'] || row['сумма']))
      .map((row: any) => {
        const userId = (row['ID'] || row['id'] || row['айди'])?.toString().trim();
        const amountStr = (row['Сумма'] || row['сумма'])?.toString() || '0';
        const amount = parseFloat(amountStr.replace(/[^\d.]/g, '') || '0');
        const date = (row['Дата'] || row['дата'])?.trim() || new Date().toISOString();

        return { userId, amount, date };
      });
  } catch (error) {
    console.error('Error fetching loyalty data:', error);
    return [];
  }
}

export async function submitOrderLog(payload: OrderLogPayload): Promise<void> {
  await submitWebhookPayload('/api/orders', payload);
}

export async function submitFeedbackLog(payload: FeedbackPayload): Promise<void> {
  await submitWebhookPayload('/api/feedback', payload);
}

async function submitWebhookPayload(apiPath: string, payload: unknown): Promise<void> {
  const response = await fetch(apiPath, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get('content-type') || '';
  const responseText = await response.text().catch(() => '');

  if (!response.ok) {
    throw new Error(responseText || `Order log request failed with ${response.status}`);
  }

  if (!contentType.includes('application/json')) {
    throw new Error('Order log endpoint returned a non-JSON response');
  }

  let parsed: any = null;

  try {
    parsed = JSON.parse(responseText);
  } catch (error) {
    throw new Error('Order log endpoint returned invalid JSON');
  }

  if (!parsed?.ok) {
    throw new Error(parsed?.error || 'Order log endpoint did not confirm save');
  }
}
