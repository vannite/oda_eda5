import Papa from 'papaparse';
import { Product, DeliveryOption, DeliveryTier, PromoCode, LoyaltyRecord } from '../types';

const SHEET_ID = '1oXwz2zznkpY10M5GumIET6E96TjEEMd3jISM4FUy2f0';
const PRODUCTS_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
const DELIVERY_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=115101300`;
const PROMO_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=1982833599`;
const LOYALTY_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=1519224442`;

export async function fetchProducts(): Promise<Product[]> {
  try {
    const response = await fetch(PRODUCTS_URL);
    const csvData = await response.text();
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

      if (name && photo) {
        currentProduct = {
          id: `prod-${index}`,
          name: name,
          description: description, 
          image: photo,
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
    const response = await fetch(DELIVERY_URL);
    const csvData = await response.text();
    const results = Papa.parse(csvData, { header: false });
    const rows = results.data as string[][];

    if (rows.length === 0) throw new Error('Empty delivery sheet');

    const dataRows = rows
      .map((row) => row.map((cell) => cell?.toString().trim() || ''))
      .filter((row) => row.some(Boolean))
      .slice(1);

    const individualCell = dataRows.find((row) => row[0])?.[0] || '';
    const individualPrice = parsePrice(individualCell);
    const officeTiers = dataRows
      .filter((row) => row[1] && row[2])
      .map((row) => buildDeliveryTier(row[1], row[2]))
      .filter((tier): tier is DeliveryTier => tier !== null);

    if (!individualPrice && officeTiers.length === 0) {
      throw new Error('No data rows found in delivery sheet');
    }

    const officeCondition = officeTiers.map((tier) => `${tier.condition}: ${tier.price}р`).join(' | ');

    return [
      {
        id: 'delivery-office',
        name: 'Тверская, 22',
        price: officeTiers[0]?.price || 0,
        type: 'delivery',
        condition: officeCondition,
        tiers: officeTiers
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
        price: 75,
        type: 'delivery',
        condition: '1 товар: 75р | за единицу от 2 товаров: 50р | за единицу от 3 до 5 товаров: 25р | от 5 товаров: 0р',
        tiers: [
          { price: 75, condition: '1 товар', minItems: 1, maxItems: 1 },
          { price: 50, condition: 'за единицу от 2 товаров', minItems: 2, perItem: true },
          { price: 25, condition: 'за единицу от 3 до 5 товаров', minItems: 3, maxItems: 5, perItem: true },
          { price: 0, condition: 'от 5 товаров', minItems: 5 }
        ]
      },
      { id: 'default-indiv', name: 'Индивидуальная', price: 150, type: 'delivery', condition: 'от 500р' }
    ];
  }
}

function parsePrice(value: string): number {
  return parseFloat(value.replace(/[^\d.,]/g, '').replace(',', '.') || '0');
}

function buildDeliveryTier(priceCell: string, conditionCell: string): DeliveryTier | null {
  const price = parsePrice(priceCell);
  const condition = conditionCell.trim();

  if (!condition) return null;

  const rangeMatch = condition.match(/от\s+(\d+)\s+до\s+(\d+)/i);
  const singleItemMatch = condition.match(/^(\d+)\s+товар/i);
  const minMatch = condition.match(/от\s+(\d+)/i);
  const maxMatch = condition.match(/до\s+(\d+)/i);

  let minItems: number | undefined;
  let maxItems: number | undefined;

  if (rangeMatch) {
    minItems = parseInt(rangeMatch[1], 10);
    maxItems = parseInt(rangeMatch[2], 10);
  } else if (singleItemMatch) {
    minItems = parseInt(singleItemMatch[1], 10);
    maxItems = minItems;
  } else {
    if (minMatch) minItems = parseInt(minMatch[1], 10);
    if (maxMatch) maxItems = parseInt(maxMatch[1], 10);
  }

  return {
    price,
    condition,
    minItems,
    maxItems,
    perItem: /за\s+единицу/i.test(condition)
  };
}

export async function fetchPromoCodes(): Promise<PromoCode[]> {
  try {
    const response = await fetch(PROMO_URL);
    const csvData = await response.text();
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
    const response = await fetch(LOYALTY_URL);
    const csvData = await response.text();
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
