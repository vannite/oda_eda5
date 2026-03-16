export interface ProductWeight {
  weight: string;
  price: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  image: string;
  category: string;
  weights: ProductWeight[];
}

export interface CartItem extends Product {
  selectedWeight: ProductWeight;
  quantity: number;
}

export interface DeliveryOption {
  id: string;
  name: string;
  price: number;
  type: 'delivery' | 'pickup';
  condition?: string; // Условия из 3-го столбца
  tiers?: DeliveryTier[];
}

export interface DeliveryTier {
  price: number;
  condition: string;
  minItems?: number;
  maxItems?: number;
  perItem?: boolean;
}

export interface PromoCode {
  code: string;
  discount: number; // Может быть процентом или фиксированной суммой
  type: 'percent' | 'fixed';
}

export interface LoyaltyRecord {
  userId: string;
  amount: number;
  date: string;
}
