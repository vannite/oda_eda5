import Papa from 'papaparse';
import { Product, DeliveryOption, PromoCode, LoyaltyRecord } from '../types';

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
    // Parse without headers to access columns A, B, C directly
    const results = Papa.parse(csvData, { header: false });
    const rows = results.data as string[][];
    
    if (rows.length === 0) throw new Error('Empty delivery sheet');

    // Find the first row that looks like data (contains numbers in Col A or B)
    const dataRow = rows.find(row => {
      const valA = row[0]?.toString().replace(/[^\d.]/g, '');
      const valB = row[1]?.toString().replace(/[^\d.]/g, '');
      return (valA && !isNaN(parseFloat(valA))) || (valB && !isNaN(parseFloat(valB)));
    });

    if (!dataRow) throw new Error('No data row found in delivery sheet');

    const indivPrice = parseFloat(dataRow[0]?.toString().replace(/[^\d.]/g, '') || '0');
    const officePrice = parseFloat(dataRow[1]?.toString().replace(/[^\d.]/g, '') || '0');
    const officeCondition = dataRow[2]?.toString().trim() || '';

    return [
      {
        id: 'delivery-office',
        name: 'Тверская, 22',
        price: officePrice,
        type: 'delivery',
        condition: officeCondition
      },
      {
        id: 'delivery-indiv',
        name: 'Индивидуальная',
        price: indivPrice,
        type: 'delivery',
        condition: 'от 500р'
      }
    ];
  } catch (error) {
    console.error('Error fetching delivery options:', error);
    return [
      { id: 'default-office', name: 'Тверская, 22', price: 75, type: 'delivery', condition: 'Бесплатно от 1000р' },
      { id: 'default-indiv', name: 'Индивидуальная', price: 150, type: 'delivery', condition: 'от 500р' }
    ];
  }
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
