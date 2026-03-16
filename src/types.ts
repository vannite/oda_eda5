export interface ProductWeight {
  weight: string;
  price: number;
  priceLabel?: string;
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

export interface OrderLogPayload {
  entryType?: 'order';
  orderId: string;
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  itemsSummary: string;
  cartSnapshot: string;
  subtotal: number;
  deliveryName: string;
  deliveryCost: number;
  total: number;
  promoCode: string;
  promoDiscount: number;
  bargainDiscount: number;
  loyaltyDiscount: number;
  priorityFee: number;
  priorityEnabled: boolean;
  comment: string;
}

export interface FeedbackPayload {
  entryType: 'feedback';
  feedbackId: string;
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  subject: string;
  message: string;
}
