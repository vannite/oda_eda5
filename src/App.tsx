/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingCart, ChevronRight, Minus, Plus, X, Truck, Store, Info, Star, Zap } from 'lucide-react';
import { fetchProducts, fetchDeliveryOptions, fetchPromoCodes, fetchLoyaltyData, submitOrderLog } from './services/products';
import { Product, CartItem, DeliveryOption, ProductWeight, PromoCode, OrderLogPayload } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CATEGORY_ORDER = ['all', 'мясо', 'сыры', 'оливки', 'орехи', 'снеки', 'другое'] as const;

type CategoryKey = typeof CATEGORY_ORDER[number];
type PriceSort = 'featured' | 'asc' | 'desc';

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  all: 'Все',
  мясо: 'Мясо',
  сыры: 'Сыры',
  оливки: 'Оливки',
  орехи: 'Орехи',
  снеки: 'Снеки',
  другое: 'Другое',
};

function getProductCategory(product: Product): Exclude<CategoryKey, 'all'> {
  const normalized = product.category?.trim().toLowerCase();
  return (CATEGORY_ORDER.includes(normalized as CategoryKey) ? normalized : 'другое') as Exclude<CategoryKey, 'all'>;
}

function getNumericWeight(weight: string): number {
  const parsed = parseFloat(weight.replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function getProductMinPrice(product: Product): number {
  return Math.min(...product.weights.map((weight) => weight.price));
}

function getProductValueScore(product: Product): number {
  return Math.max(
    ...product.weights.map((weight) => {
      const quantity = getNumericWeight(weight.weight);
      return quantity / Math.max(weight.price, 1);
    })
  );
}

function buildFeaturedFeed(products: Product[]): Product[] {
  const pool = products.map((product) => {
    const valueScore = getProductValueScore(product);
    const minPrice = getProductMinPrice(product);

    return {
      product,
      weight: 1 + valueScore * 2600 + (1 / Math.max(minPrice, 1)) * 320,
    };
  });

  const ordered: Product[] = [];

  while (pool.length > 0) {
    const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * totalWeight;
    let pickedIndex = 0;

    for (let index = 0; index < pool.length; index += 1) {
      roll -= pool[index].weight;
      if (roll <= 0) {
        pickedIndex = index;
        break;
      }
    }

    const [picked] = pool.splice(pickedIndex, 1);
    ordered.push(picked.product);
  }

  return ordered;
}

export default function App() {
  const telegramUser = WebApp.initDataUnsafe.user;
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // New States
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(null);
  
  const [isPriority, setIsPriority] = useState(false);
  
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [isLoyaltyApplied, setIsLoyaltyApplied] = useState(false);
  
  const [bargainPercent, setBargainPercent] = useState<number | null>(null);
  const [customBargain, setCustomBargain] = useState('');
  const [isBargaining, setIsBargaining] = useState(false);
  
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showPrepaymentInfo, setShowPrepaymentInfo] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('all');
  const [priceSort, setPriceSort] = useState<PriceSort>('featured');
  const [homeFeedVersion, setHomeFeedVersion] = useState(0);

  const userId = telegramUser?.id?.toString() || 'guest';

  useEffect(() => {
    const storedCart = localStorage.getItem(`cart_${userId}`);
    if (!storedCart) return;

    try {
      const parsedCart = JSON.parse(storedCart) as CartItem[];
      if (Array.isArray(parsedCart)) {
        setCart(parsedCart);
      }
    } catch (error) {
      console.warn('Failed to restore cart from localStorage', error);
    }
  }, [userId]);

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    
    const loadData = async () => {
      const [productsData, deliveryData, promoData, loyaltyData] = await Promise.all([
        fetchProducts(),
        fetchDeliveryOptions(),
        fetchPromoCodes(),
        fetchLoyaltyData()
      ]);
      setProducts(productsData);
      setHomeFeedVersion((value) => value + 1);
      setDeliveryOptions(deliveryData);
      setPromoCodes(promoData);
      
      // Calculate loyalty points
      const userRecords = loyaltyData.filter(r => r.userId === userId);
      const totalPoints = userRecords.reduce((sum, r) => {
        const recordDate = new Date(r.date);
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        if (recordDate > threeMonthsAgo) {
          return sum + (r.amount * 0.03);
        }
        return sum;
      }, 0);
      setLoyaltyPoints(Math.floor(totalPoints));

      if (deliveryData.length > 0) {
        setSelectedDeliveryId(deliveryData[0].id);
      }
      setLoading(false);
    };
    loadData();
  }, [userId]);

  useEffect(() => {
    localStorage.setItem(`cart_${userId}`, JSON.stringify(cart));
  }, [cart, userId]);

  const addToCart = (product: Product, selectedWeight: ProductWeight) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id && item.selectedWeight.weight === selectedWeight.weight);
      if (existing) {
        return prev.map(item => 
          (item.id === product.id && item.selectedWeight.weight === selectedWeight.weight)
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, selectedWeight, quantity: 1 }];
    });
    WebApp.HapticFeedback.impactOccurred('light');
  };

  const removeFromCart = (productId: string, weight: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === productId && item.selectedWeight.weight === weight);
      if (existing && existing.quantity > 1) {
        return prev.map(item => 
          (item.id === productId && item.selectedWeight.weight === weight)
            ? { ...item, quantity: item.quantity - 1 }
            : item
        );
      }
      return prev.filter(item => !(item.id === productId && item.selectedWeight.weight === weight));
    });
    WebApp.HapticFeedback.impactOccurred('light');
  };

  const totalItems = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  const selectedDelivery = useMemo(() => 
    deliveryOptions.find(o => o.id === selectedDeliveryId) || deliveryOptions[0]
  , [deliveryOptions, selectedDeliveryId]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + (item.selectedWeight.price * item.quantity), 0), [cart]);

  const getApplicableDeliveryTier = (option?: DeliveryOption | null) => {
    if (!option?.tiers?.length || totalItems === 0) return null;

    return [...option.tiers]
      .filter((tier) => {
        const minOk = tier.minItems === undefined || totalItems >= tier.minItems;
        const maxOk = tier.maxItems === undefined || totalItems <= tier.maxItems;
        return minOk && maxOk;
      })
      .sort((a, b) => (b.minItems || 0) - (a.minItems || 0))[0] || null;
  };

  const getDeliveryCostForOption = (option?: DeliveryOption | null) => {
    if (!option) return 0;
    if (option.type === 'pickup') return 0;
    if (totalItems === 0) return 0;

    const tier = getApplicableDeliveryTier(option);
    if (tier) {
      return tier.perItem ? tier.price * totalItems : tier.price;
    }
    
    const condition = option.condition?.toLowerCase() || '';
    if (condition.includes('бесплатно от')) {
      const thresholdMatch = condition.match(/\d+/);
      if (thresholdMatch) {
        const threshold = parseInt(thresholdMatch[0], 10);
        if (subtotal >= threshold) return 0;
      }
    }

    return option.price;
  };

  const getDeliveryConditionLabel = (option?: DeliveryOption | null) => {
    const tier = getApplicableDeliveryTier(option);
    return tier?.condition || option?.condition || '';
  };

  // Discounts & Fees
  const promoDiscount = useMemo(() => {
    if (!appliedPromo || isLoyaltyApplied) return 0;
    if (appliedPromo.type === 'percent') {
      return Math.floor(subtotal * (appliedPromo.discount / 100));
    }
    return appliedPromo.discount;
  }, [appliedPromo, subtotal, isLoyaltyApplied]);

  const bargainDiscount = useMemo(() => {
    if (appliedPromo || isLoyaltyApplied) return 0; // Скидка по промокоду или баллы отменяют торг
    const percent = bargainPercent || parseFloat(customBargain) || 0;
    return Math.floor(subtotal * (percent / 100));
  }, [appliedPromo, isLoyaltyApplied, bargainPercent, customBargain, subtotal]);

  const loyaltyDiscount = useMemo(() => {
    if (!isLoyaltyApplied || appliedPromo) return 0;
    const maxDiscount = Math.floor(subtotal * 0.15);
    return Math.min(loyaltyPoints, maxDiscount);
  }, [isLoyaltyApplied, loyaltyPoints, subtotal, appliedPromo]);

  const deliveryCost = useMemo(() => getDeliveryCostForOption(selectedDelivery), [selectedDelivery, totalItems, subtotal]);

  const priorityFee = isPriority ? 100 : 0;

  const total = subtotal - promoDiscount - bargainDiscount - loyaltyDiscount + deliveryCost + priorityFee;

  const handleApplyPromo = () => {
    const usedPromos = JSON.parse(localStorage.getItem(`used_promos_${userId}`) || '[]');
    if (usedPromos.includes(promoInput)) {
      WebApp.showAlert('Вы уже использовали этот промокод!');
      return;
    }

    const promo = promoCodes.find(p => p.code.toLowerCase() === promoInput.toLowerCase());
    if (promo) {
      setAppliedPromo(promo);
      setIsLoyaltyApplied(false); // Mutually exclusive
      setIsBargaining(false);
      setBargainPercent(null);
      setCustomBargain('');
      WebApp.HapticFeedback.notificationOccurred('success');
    } else {
      WebApp.showAlert('Неверный промокод');
    }
  };

  const handleCheckout = () => {
    if (cart.length === 0) return;
    setShowPrepaymentInfo(true);
  };

  const openProduct = (product: Product) => {
    setSelectedProduct(product);
  };

  const featuredProducts = useMemo(() => buildFeaturedFeed(products), [products, homeFeedVersion]);

  const filteredProducts = useMemo(() => {
    const source = priceSort === 'featured' ? featuredProducts : [...products].sort((left, right) => {
      const leftPrice = getProductMinPrice(left);
      const rightPrice = getProductMinPrice(right);
      return priceSort === 'asc' ? leftPrice - rightPrice : rightPrice - leftPrice;
    });

    if (selectedCategory === 'all') return source;
    return source.filter((product) => getProductCategory(product) === selectedCategory);
  }, [featuredProducts, priceSort, products, selectedCategory]);

  const categoryCounts = useMemo(() => {
    return CATEGORY_ORDER.reduce<Record<CategoryKey, number>>((acc, category) => {
      acc[category] = category === 'all'
        ? products.length
        : products.filter((product) => getProductCategory(product) === category).length;
      return acc;
    }, { all: 0, мясо: 0, сыры: 0, оливки: 0, орехи: 0, снеки: 0, другое: 0 });
  }, [products]);

  const confirmCheckout = async () => {
    const itemsText = cart.map(item => 
      `${item.name} (${item.selectedWeight.weight}) x${item.quantity} - ${item.selectedWeight.price * item.quantity}р`
    ).join('\n');

    const deliveryText = selectedDelivery ? `${selectedDelivery.name} (${deliveryCost}р)` : 'Не выбрано';
    
    let message = (isPriority ? "!!! ПРИОРИТЕТНЫЙ ЗАКАЗ !!!\n\n" : "") +
      `Я хочу купить эти позиции на сумму ${total}р:\n\n${itemsText}\n\n` +
      `Доставка: ${deliveryText}\n` +
      `Сумма: ${subtotal}р\n`;
    
    if (promoDiscount > 0) message += `Промокод (${appliedPromo?.code}): -${promoDiscount}р\n`;
    if (bargainDiscount > 0) message += `Торг (${bargainPercent || customBargain}%): -${bargainDiscount}р\n`;
    if (loyaltyDiscount > 0) message += `Баллы лояльности: -${loyaltyDiscount}р\n`;
    if (priorityFee > 0) message += `Приоритетное обслуживание: +${priorityFee}р\n`;
    
    message += `\nИтого к оплате: ${total}р\n(Предоплата 50%: ${Math.ceil(total / 2)}р)`;
    
    const encodedMessage = encodeURIComponent(message.replace(/\n/g, '\r\n'));
    const ownerUsername = 'bd77797';
    const url = `https://t.me/${ownerUsername}?text=${encodedMessage}`;

    const orderPayload: OrderLogPayload = {
      orderId: `ODA-${userId}-${Date.now()}`,
      userId,
      username: telegramUser?.username || '',
      firstName: telegramUser?.first_name || '',
      lastName: telegramUser?.last_name || '',
      createdAt: new Date().toISOString(),
      status: 'checkout_clicked',
      paymentStatus: 'pending',
      itemsSummary: itemsText,
      cartSnapshot: JSON.stringify(cart),
      subtotal,
      deliveryName: selectedDelivery?.name || '',
      deliveryCost,
      total,
      promoCode: appliedPromo?.code || '',
      promoDiscount,
      bargainDiscount,
      loyaltyDiscount,
      priorityFee,
      priorityEnabled: isPriority,
      comment: 'Order created from Telegram Mini App',
    };

    try {
      await submitOrderLog(orderPayload);
    } catch (error) {
      console.warn('Order log was not saved to Google Sheets', error);
    }
    
    // Mark promo as used
    if (appliedPromo) {
      const usedPromos = JSON.parse(localStorage.getItem(`used_promos_${userId}`) || '[]');
      localStorage.setItem(`used_promos_${userId}`, JSON.stringify([...usedPromos, appliedPromo.code]));
    }

    WebApp.openTelegramLink(url);
    setShowPrepaymentInfo(false);
  };

  if (loading) {
    return (
      <div className="app-shell min-h-screen text-white">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="ambient-orb ambient-orb-a" />
          <div className="ambient-orb ambient-orb-b" />
          <div className="ambient-orb ambient-orb-c" />
          <div className="ambient-grid" />
        </div>
        <div className="relative flex min-h-screen items-center justify-center px-6">
          <div className="glass-panel flex w-full max-w-sm flex-col items-center gap-5 rounded-[32px] px-8 py-10 text-center">
            <div className="floating-pill">
              <Info size={14} />
              Загрузка меню
            </div>
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="h-12 w-12 rounded-full border-4 border-white/10 border-t-[#dbff4f]"
            />
            <div>
              <p className="font-display text-3xl uppercase tracking-[0.16em] text-white">ODA EDA</p>
              <p className="mt-2 text-sm text-white/58">Подготавливаем каталог и условия заказа.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen text-white font-sans selection:bg-white/20">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="ambient-orb ambient-orb-a" />
        <div className="ambient-orb ambient-orb-b" />
        <div className="ambient-orb ambient-orb-c" />
        <div className="ambient-grid" />
      </div>
      <div className="relative mx-auto max-w-[480px] pb-28">
      {/* Header */}
      <header className="glass-panel sticky top-3 z-40 mx-4 mt-3 flex items-center justify-between rounded-[28px] px-4 py-3">
        <button 
          onClick={() => setIsProfileOpen(true)}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          <div className="glass-chip relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#dbff4f]">
            <Star size={20} fill={loyaltyPoints > 0 ? "currentColor" : "none"} />
            {loyaltyPoints > 0 && (
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#090b14] bg-[#7bffc7]" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-[1.25rem] uppercase tracking-[0.12em] text-white">ODA EDA</h1>
            <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-white/40">Premium Food</p>
          </div>
        </button>
        <button 
          onClick={() => setIsCartOpen(true)}
          className="glass-chip relative flex h-11 w-11 items-center justify-center rounded-full"
        >
          <ShoppingCart size={24} />
          {totalItems > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#dbff4f] text-[10px] font-bold text-[#090b14] shadow-lg">
              {totalItems}
            </span>
          )}
        </button>
      </header>

      <section className="space-y-3 px-4 pt-4">
        <div className="glass-panel overflow-hidden rounded-[28px] px-4 py-4">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top,rgba(219,255,79,0.14),transparent_62%)]" />
          <div className="relative space-y-3">
            <p className="section-kicker">Curated selection</p>
            <div className="space-y-2">
              <h2 className="font-display text-[1.42rem] uppercase leading-[1] tracking-[0.05em] text-white">
                <span className="block">Редкие деликатесы</span>
                <span className="block">по честной цене</span>
              </h2>
              <p className="max-w-[21rem] text-[12px] leading-[1.35] text-white/62">
                Здесь собраны позиции, которые часто сложно найти быстро и в одном месте: выдержанные сыры, мясные деликатесы, оливки, орехи и аккуратные снеки.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <div className="scrollbar-hide min-w-0 flex-1 overflow-x-auto pb-1">
            <div className="flex gap-2 pr-2">
              {CATEGORY_ORDER.map((category) => {
                const isActive = selectedCategory === category;
                return (
                  <button
                    key={category}
                    onClick={() => {
                      setSelectedCategory(category);
                      if (category === 'all') {
                        setHomeFeedVersion((value) => value + 1);
                      }
                    }}
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition-all",
                      isActive
                        ? "border-[#dbff4f] bg-[rgba(219,255,79,0.18)] text-[#dbff4f] shadow-[0_0_24px_rgba(219,255,79,0.14)]"
                        : "border-white/10 bg-white/[0.03] text-white/56"
                    )}
                  >
                    <span>{CATEGORY_LABELS[category]}</span>
                    <span className={cn("text-[10px]", isActive ? "text-[#dbff4f]/90" : "text-white/32")}>
                      {categoryCounts[category]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => {
              setPriceSort((current) => {
                if (current === 'featured') return 'desc';
                if (current === 'desc') return 'asc';
                return 'featured';
              });
            }}
            className="glass-chip flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/72"
          >
            <span>
              {priceSort === 'featured' ? 'Выгодно' : priceSort === 'desc' ? 'Цена ↓' : 'Цена ↑'}
            </span>
          </button>
        </div>
      </section>

      {/* Product List */}
      <main className="px-4 py-4 pb-10">
        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {filteredProducts.map((product) => (
              <ProductCard 
                key={product.id} 
                product={product} 
                onAdd={addToCart} 
                onRemove={removeFromCart}
                onClick={() => openProduct(product)}
                cart={cart}
              />
            ))}
          </div>
        ) : (
          <div className="glass-panel rounded-[28px] px-5 py-8 text-center">
            <p className="section-kicker">Nothing here yet</p>
            <p className="mt-2 text-sm leading-relaxed text-white/56">
              В этой категории пока нет позиций. Попробуй соседний раздел или вернись ко всему меню.
            </p>
          </div>
        )}
      </main>

      {/* Terms Button */}
      <div className="px-4 pb-32">
        <button 
          onClick={() => setIsTermsOpen(true)}
          className="glass-panel flex w-full items-center justify-between rounded-[28px] p-4 text-left transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(219,255,79,0.16)] text-[#dbff4f]">
              <Info size={20} />
            </div>
            <div className="text-left">
              <p className="font-display text-lg uppercase tracking-[0.1em] text-white">Delivery protocol</p>
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/40">Важная информация</p>
            </div>
          </div>
          <ChevronRight size={20} className="text-white/30" />
        </button>

        <p className="mt-5 px-1 text-center text-[11px] leading-relaxed text-white/28">
          Отказ от ответственности: сервис носит информационно-логистический характер. Указанные позиции отображаются для согласования ассортимента и организации доставки; оформление через приложение не является публичной офертой или розничной продажей товаров владельцем сервиса.
        </p>
      </div>

      {/* Product Detail Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProduct(null)}
              className="fixed inset-0 bg-black/78 z-[60]"
            />
            <div className="fixed inset-x-0 bottom-0 z-[61] flex justify-center px-3 pb-3">
              <motion.div 
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '100%', opacity: 0 }}
                transition={{ type: "spring", damping: 26, stiffness: 220 }}
                className="flex max-h-[88vh] w-full max-w-[480px] flex-col overflow-hidden rounded-[32px] border border-white/10 bg-[#0b1020]/96 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
              >
                <div className="relative h-64 shrink-0">
                  <img src={selectedProduct.image} alt={selectedProduct.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" decoding="async" />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,11,20,0.08),rgba(9,11,20,0.72))]" />
                  <button 
                    onClick={() => setSelectedProduct(null)}
                    className="glass-chip absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-white"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="scrollbar-hide flex-1 overflow-y-auto p-5">
                  <div className="space-y-4">
                    <div>
                      <p className="section-kicker">Product detail</p>
                      <h2 className="mt-2 font-display text-[1.65rem] uppercase leading-[0.92] tracking-[0.06em] text-white">{selectedProduct.name}</h2>
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-white/60">
                      {selectedProduct.description || "Описание скоро появится..."}
                    </div>
                  </div>
                </div>
                <div className="border-t border-white/8 p-5">
                  <ProductWeightSelector 
                    product={selectedProduct}
                    onAdd={(p, w) => {
                      addToCart(p, w);
                      setSelectedProduct(null);
                    }}
                  />
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Cart Drawer */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 inset-x-0 z-50 mx-auto flex max-h-[90vh] max-w-[480px] flex-col overflow-hidden rounded-t-[32px] border-t border-white/10 bg-[#090b14]/92 shadow-2xl backdrop-blur-2xl"
            >
              <div className="soft-divider flex items-start justify-between gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <p className="section-kicker">Checkout</p>
                  <h2 className="font-display text-[1.35rem] uppercase leading-[1] tracking-[0.04em] text-white">Оформление заказа</h2>
                </div>
                <button onClick={() => setIsCartOpen(false)} className="glass-chip flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="scrollbar-hide flex-1 overflow-y-auto px-5 pb-5 space-y-6">
                {cart.length === 0 ? (
                  <div className="glass-panel rounded-[28px] px-6 py-12 text-center text-white/40">
                    <ShoppingCart size={48} className="mx-auto mb-4 opacity-20" />
                    <p>Ваша корзина пуста</p>
                  </div>
                ) : (
                  <>
                    {/* Cart Items */}
                    <div className="space-y-4">
                      {cart.map((item) => (
                        <div key={`${item.id}-${item.selectedWeight.weight}`} className="glass-panel flex items-center gap-3 rounded-[24px] px-3 py-3">
                          <img src={item.image} alt={item.name} className="h-14 w-14 rounded-xl object-cover bg-white/5" referrerPolicy="no-referrer" />
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-medium leading-tight">{item.name}</h3>
                            <p className="text-xs text-white/40 mt-1">{item.selectedWeight.weight} • {item.selectedWeight.price}р</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 rounded-full bg-white/5 p-1">
                            <button onClick={() => removeFromCart(item.id, item.selectedWeight.weight)} className="glass-chip flex h-8 w-8 items-center justify-center rounded-full"><Minus size={14} /></button>
                            <span className="min-w-5 text-center text-sm font-medium">{item.quantity}</span>
                            <button onClick={() => addToCart(item, item.selectedWeight)} className="glass-chip flex h-8 w-8 items-center justify-center rounded-full"><Plus size={14} /></button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Delivery Options */}
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Доставка</h3>
                      <div className="grid grid-cols-2 gap-2.5">
                        {deliveryOptions.map((option) => (
                            <button 
                              key={option.id}
                              onClick={() => {
                                setSelectedDeliveryId(option.id);
                                if (option.name === 'Тверская, 22') {
                                  if (navigator.clipboard?.writeText) {
                                    void navigator.clipboard.writeText('Тверская, 22').catch(() => undefined);
                                  }
                                  WebApp.HapticFeedback.notificationOccurred('success');
                                  WebApp.showAlert('Адрес Тверская, 22 скопирован');
                                }
                              }}
                              className={cn(
                                "glass-panel relative flex min-h-[138px] flex-col items-start justify-between gap-2 overflow-hidden rounded-[24px] p-4 text-left transition-all",
                                selectedDeliveryId === option.id ? "ring-1 ring-[#dbff4f] shadow-[0_0_40px_rgba(219,255,79,0.18)]" : ""
                              )}
                            >
                            <div className="flex justify-between w-full items-center">
                              {option.type === 'pickup' ? <Store size={18} /> : <Truck size={18} />}
                              <span className="font-display text-lg uppercase tracking-[0.06em] text-[#dbff4f]">{totalItems > 0 ? getDeliveryCostForOption(option) : option.price}р</span>
                            </div>
                              <span className="max-w-full whitespace-normal break-normal text-[0.9rem] font-semibold leading-[1.1] tracking-0 text-white [hyphens:none] [overflow-wrap:normal] [word-break:normal]">
                                {option.name}
                              </span>
                            {getDeliveryConditionLabel(option) && (
                              <span className="text-[10px] text-white/40 leading-tight">{getDeliveryConditionLabel(option)}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Promo & Loyalty */}
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Скидки и бонусы</h3>
                      
                      {/* Promo Code */}
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={promoInput}
                          onChange={(e) => setPromoInput(e.target.value)}
                          placeholder="Промокод"
                          disabled={!!appliedPromo}
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
                        />
                        {appliedPromo ? (
                          <button onClick={() => {setAppliedPromo(null); setPromoInput('');}} className="glass-chip rounded-xl px-4 text-red-300"><X size={18} /></button>
                        ) : (
                          <button onClick={handleApplyPromo} className="liquid-button rounded-xl px-6 text-sm font-bold">Применить</button>
                        )}
                      </div>

                      {/* Loyalty Points */}
                      <button 
                        onClick={() => {
                          if (loyaltyPoints > 0) {
                            setIsLoyaltyApplied(!isLoyaltyApplied);
                            if (!isLoyaltyApplied) setAppliedPromo(null); // Mutually exclusive
                          }
                        }}
                        disabled={loyaltyPoints === 0}
                        className={cn(
                          "glass-panel w-full p-4 rounded-[24px] flex justify-between items-center transition-all",
                          isLoyaltyApplied ? "ring-1 ring-[#7bffc7]" : "",
                          loyaltyPoints === 0 && "opacity-50 grayscale"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Star size={20} className={isLoyaltyApplied ? "text-emerald-400" : "text-white/20"} fill={isLoyaltyApplied ? "currentColor" : "none"} />
                          <div className="text-left">
                            <p className="text-xs font-bold">Списать баллы</p>
                            <p className="text-[10px] text-white/40">
                              {loyaltyPoints > 0 ? `Доступно: ${loyaltyPoints} (макс. 15%)` : "У вас пока нет баллов"}
                            </p>
                          </div>
                        </div>
                        {isLoyaltyApplied && <span className="text-emerald-400 font-bold">-{loyaltyDiscount}р</span>}
                      </button>
                    </div>

                    {/* Bargain Section */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Торговаться</h3>
                        {(appliedPromo || isLoyaltyApplied) && <span className="text-[9px] text-red-400 font-bold uppercase">Недоступно с промокодом или баллами</span>}
                      </div>
                      
                      <div className={cn("grid grid-cols-4 gap-2", (appliedPromo || isLoyaltyApplied) && "opacity-30 pointer-events-none")}>
                        {[3, 5, 7].map(p => (
                          <button 
                            key={p}
                            onClick={() => {setBargainPercent(p); setCustomBargain('');}}
                            className={cn(
                              "py-3 rounded-xl border text-xs font-bold transition-all",
                              bargainPercent === p ? "border-[#dbff4f] bg-[rgba(219,255,79,0.18)] text-[#dbff4f]" : "bg-white/5 border-white/10"
                            )}
                          >
                            {p}%
                          </button>
                        ))}
                        <div className="relative">
                          <input 
                            type="number" 
                            placeholder="%"
                            value={customBargain}
                            onChange={(e) => {setCustomBargain(e.target.value); setBargainPercent(null);}}
                            className={cn(
                              "w-full py-3 rounded-xl border bg-white/5 text-center text-xs font-bold focus:outline-none",
                              customBargain ? "border-emerald-500" : "border-white/10"
                            )}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Priority Order */}
                    <button 
                      onClick={() => setIsPriority(!isPriority)}
                      className={cn(
                        "glass-panel w-full p-4 rounded-[24px] border flex justify-between items-center transition-all",
                        isPriority ? "ring-1 ring-[#ffb24f]" : ""
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Zap size={20} className={isPriority ? "text-amber-400" : "text-white/20"} fill={isPriority ? "currentColor" : "none"} />
                        <div className="text-left">
                          <p className="text-xs font-bold">Приоритетный заказ</p>
                          <p className="text-[10px] text-white/40">Обработка в первую очередь (+100р)</p>
                        </div>
                      </div>
                      {isPriority && <span className="text-amber-400 font-bold">+100р</span>}
                    </button>
                  </>
                )}
              </div>

              {cart.length > 0 && (
                <div className="soft-divider space-y-4 p-5">
                  <div className="space-y-2">
                    <div className="flex justify-between gap-3 text-sm text-white/60">
                      <span>Сумма</span>
                      <span className="shrink-0">{subtotal}р</span>
                    </div>
                    {promoDiscount > 0 && (
                      <div className="flex justify-between gap-3 text-sm text-emerald-400">
                        <span className="min-w-0">Промокод ({appliedPromo?.code})</span>
                        <span className="shrink-0">-{promoDiscount}р</span>
                      </div>
                    )}
                    {bargainDiscount > 0 && (
                      <div className="flex justify-between gap-3 text-sm text-emerald-400">
                        <span className="min-w-0">Торг ({bargainPercent || customBargain}%)</span>
                        <span className="shrink-0">-{bargainDiscount}р</span>
                      </div>
                    )}
                    {loyaltyDiscount > 0 && (
                      <div className="flex justify-between gap-3 text-sm text-emerald-400">
                        <span>Баллы</span>
                        <span className="shrink-0">-{loyaltyDiscount}р</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-3 text-sm text-white/60">
                      <span className="min-w-0 truncate">Доставка ({selectedDelivery?.name})</span>
                      <span className="shrink-0">{deliveryCost}р</span>
                    </div>
                    {isPriority && (
                      <div className="flex justify-between gap-3 text-sm text-amber-400">
                        <span>Приоритет</span>
                        <span className="shrink-0">+100р</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-3 pt-2 text-lg font-bold border-t border-white/5">
                      <span>Итого</span>
                      <span className="shrink-0">{total}р</span>
                    </div>
                  </div>
                  <button 
                    onClick={handleCheckout}
                    className="liquid-button flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold"
                  >
                    Оформить заказ
                    <ChevronRight size={20} />
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Terms Modal */}
      <AnimatePresence>
        {isTermsOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTermsOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-[80]"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="fixed inset-x-4 top-[12vh] z-[80] mx-auto w-auto max-w-[420px]"
            >
              <div className="glass-panel max-h-[76vh] space-y-5 overflow-y-auto rounded-[32px] border border-white/12 bg-[#101524]/94 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="section-kicker">Delivery info</p>
                    <h2 className="font-display text-[1.6rem] uppercase leading-[0.95] tracking-[0.08em] text-white">Доставка и оплата</h2>
                  </div>
                  <button onClick={() => setIsTermsOpen(false)} className="glass-chip flex h-10 w-10 shrink-0 items-center justify-center rounded-full"><X size={20} /></button>
                </div>

                <div className="space-y-4">
                  <section className="space-y-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-400">Доставка на Тверскую, 22</h3>
                    <div className="glass-panel rounded-[22px] p-4 space-y-2">
                      <p className="text-sm leading-relaxed text-white/80">
                        Доставка осуществляется с <span className="text-white font-bold">Пн по Пт</span> через неделю после заказа.
                      </p>
                      <p className="text-xs text-white/40 italic">
                        Пример: заказали во вторник — забираете на следующей неделе в Пн-Вт.
                      </p>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-400">Индивидуальная доставка</h3>
                    <div className="glass-panel rounded-[22px] p-4">
                      <p className="text-sm leading-relaxed text-white/80">
                        Приоритетные заказы с индивидуальной доставкой обсуждаются отдельно в личном чате.
                      </p>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/40">Оплата</h3>
                    <div className="glass-panel rounded-[22px] p-4">
                      <p className="text-sm leading-relaxed text-white/80">
                        Предоплата <span className="text-white font-bold">50%</span> для подтверждения заказа. Оплата принимается <span className="text-white font-bold underline">только наличными</span>.
                      </p>
                    </div>
                  </section>
                </div>

                <button 
                  onClick={() => setIsTermsOpen(false)}
                  className="liquid-button w-full py-4 rounded-2xl font-bold"
                >
                  Понятно
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Profile Modal */}
      <AnimatePresence>
        {isProfileOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsProfileOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-[70]"
            />
            <motion.div 
              initial={{ scale: 0.94, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 16 }}
              className="fixed inset-x-4 top-[12vh] z-[70] mx-auto w-auto max-w-[420px]"
            >
              <div className="glass-panel max-h-[76vh] space-y-6 overflow-y-auto rounded-[32px] border border-white/12 bg-[#101524]/94 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="section-kicker">Loyalty profile</p>
                    <h2 className="font-display text-[1.45rem] uppercase tracking-[0.08em] text-white">Профиль лояльности</h2>
                  </div>
                  <button onClick={() => setIsProfileOpen(false)} className="glass-chip flex h-10 w-10 shrink-0 items-center justify-center rounded-full"><X size={20} /></button>
                </div>

                <div className="glass-panel rounded-3xl p-8 text-center space-y-4">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[radial-gradient(circle,rgba(219,255,79,0.32),rgba(219,255,79,0.08)_55%,transparent_70%)] text-[#dbff4f]">
                    <Star size={40} fill="white" className="text-white" />
                  </div>
                  <div>
                    <p className="font-display text-4xl uppercase tracking-[0.08em] text-white">{loyaltyPoints}</p>
                    <p className="text-xs font-bold uppercase tracking-widest text-white/40">Доступных баллов</p>
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-white/20">
                    Версия: 1.0.5 (Обновлено: 14.03 23:20)
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-white/40">Как это работает?</h3>
                  <div className="grid gap-3">
                    <div className="glass-panel flex items-center gap-4 rounded-[24px] p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(123,255,199,0.14)] text-[#7bffc7] font-bold">3%</div>
                      <p className="text-xs text-white/60">Получайте 3% баллами с каждой подтвержденной покупки</p>
                    </div>
                    <div className="glass-panel flex items-center gap-4 rounded-[24px] p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(123,255,199,0.14)] text-[#7bffc7] font-bold">15%</div>
                      <p className="text-xs text-white/60">Оплачивайте до 15% от суммы заказа накопленными баллами</p>
                    </div>
                    <div className="glass-panel flex items-center gap-4 rounded-[24px] p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(255,178,79,0.14)] text-[#ffb24f] font-bold">3м</div>
                      <p className="text-xs text-white/60">Баллы действительны в течение 3 месяцев с момента начисления</p>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => setIsProfileOpen(false)}
                  className="liquid-button w-full rounded-2xl py-4 font-bold"
                >
                  Понятно
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showPrepaymentInfo && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPrepaymentInfo(false)}
              className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100]"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 24 }}
              className="fixed inset-x-4 top-[20vh] z-[101] mx-auto w-auto max-w-[420px]"
            >
              <div className="glass-panel space-y-6 rounded-[32px] border border-white/12 bg-[#101524]/92 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(255,178,79,0.16)] text-[#ffb24f]">
                  <Info size={32} />
                </div>
                <div className="text-center space-y-2">
                  <h2 className="font-display text-2xl uppercase tracking-[0.08em] text-white">Важная информация</h2>
                  <p className="text-sm text-white/60">Для подтверждения заказа необходимо внести предоплату в размере <span className="text-white font-bold">50% ({Math.ceil(total / 2)}р)</span>.</p>
                  <p className="text-sm text-white/60">Оплата принимается <span className="text-white font-bold underline">только наличными</span>.</p>
                </div>
                <div className="space-y-3 pt-2">
                  <button 
                    onClick={confirmCheckout}
                    className="liquid-button w-full py-4 rounded-2xl font-bold"
                  >
                    Понятно, заказать
                  </button>
                  <button 
                    onClick={() => setShowPrepaymentInfo(false)}
                    className="ghost-button w-full rounded-2xl py-3 text-white/70 text-xs font-bold uppercase tracking-widest"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Quick Summary Bar */}
      {totalItems > 0 && !isCartOpen && (
        <motion.div initial={{ y: 100 }} animate={{ y: 0 }} className="fixed bottom-4 left-0 right-0 z-40 mx-auto max-w-[480px] px-4">
          <button onClick={() => setIsCartOpen(true)} className="glass-panel flex w-full items-center justify-between rounded-[28px] p-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(219,255,79,0.16)] text-[#dbff4f]"><ShoppingCart size={20} /></div>
              <div className="text-left">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/44">{totalItems} поз.</p>
                <p className="font-display text-2xl uppercase tracking-[0.08em] text-white">{total}р</p>
              </div>
            </div>
            <span className="glass-chip rounded-full px-4 py-2 text-xs uppercase tracking-[0.18em]">Корзина</span>
          </button>
        </motion.div>
      )}
      </div>
    </div>
  );
}

const ProductCard: React.FC<{
  product: Product;
  cart: CartItem[];
  onAdd: (p: Product, w: ProductWeight) => void;
  onRemove: (productId: string, weight: string) => void;
  onClick: () => void;
}> = ({ product, cart, onAdd, onRemove, onClick }) => {
  const [selectedWeightIdx, setSelectedWeightIdx] = useState(0);
  const selectedWeight = product.weights[selectedWeightIdx];
  const hasMultipleWeights = product.weights.length > 1;
  const currentCartItem = cart.find((item) => item.id === product.id && item.selectedWeight.weight === selectedWeight.weight);
  const currentQuantity = currentCartItem?.quantity || 0;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="glass-panel min-w-0 overflow-hidden rounded-[26px] flex flex-col"
    >
      <div className="relative aspect-[1.06/1] overflow-hidden group cursor-pointer" onClick={onClick}>
        <img src={product.image} alt={product.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" referrerPolicy="no-referrer" loading="lazy" decoding="async" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,11,20,0.08),rgba(9,11,20,0.76))]" />
        <div className="absolute bottom-2 left-2 glass-chip rounded-lg p-1.5">
          <Info size={14} className="text-white/60" />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <h3 className="cursor-pointer text-[0.86rem] font-semibold uppercase leading-[0.96] tracking-[0.03em] text-white line-clamp-3 min-h-[2.65rem]" onClick={onClick}>{product.name}</h3>

        {hasMultipleWeights && (
          <div className="flex flex-wrap gap-1.5 self-start">
            {product.weights.map((w, idx) => (
              <button
                key={w.weight}
                onClick={(e) => { e.stopPropagation(); setSelectedWeightIdx(idx); }}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[10px] font-bold transition-all",
                  selectedWeightIdx === idx ? "border-[#dbff4f] bg-[rgba(219,255,79,0.18)] text-[#dbff4f]" : "border-white/10 bg-white/6 text-white/60"
                )}
              >
                {w.weight}
              </button>
            ))}
          </div>
        )}

        <div className={cn("mt-auto flex flex-col gap-3", !hasMultipleWeights && "pt-2")}>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0 flex flex-col">
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Цена</span>
              <span className="font-display text-[2rem] leading-none uppercase tracking-[0.02em] text-[#dbff4f]">{selectedWeight.price}р</span>
            </div>
            {currentQuantity === 0 && (
              <button 
                onClick={(e) => { e.stopPropagation(); onAdd(product, selectedWeight); }}
                className="liquid-button h-10 w-10 shrink-0 rounded-[20px] p-0 active:scale-90"
              >
                <Plus size={17} />
              </button>
            )}
          </div>

          {currentQuantity > 0 && (
            <div className="flex w-full items-center rounded-full bg-[#ff3a34] px-2 py-1.5 text-white shadow-[0_14px_34px_rgba(255,58,52,0.28)]">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(product.id, selectedWeight.weight);
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/92"
              >
                <Minus size={16} />
              </button>
              <span className="flex-1 text-center text-[0.95rem] font-bold">
                {currentQuantity} шт
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd(product, selectedWeight);
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/92"
              >
                <Plus size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

const ProductWeightSelector: React.FC<{ product: Product; onAdd: (p: Product, w: ProductWeight) => void }> = ({ product, onAdd }) => {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const weight = product.weights[selectedIdx];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {product.weights.map((w, idx) => (
          <button
            key={w.weight}
            onClick={() => setSelectedIdx(idx)}
            className={cn(
              "px-4 py-2 rounded-full text-xs font-bold border transition-all",
              selectedIdx === idx ? "border-[#dbff4f] bg-[rgba(219,255,79,0.18)] text-[#dbff4f]" : "bg-white/5 border-white/10 text-white/60"
            )}
          >
            {w.weight} — {w.price}р
          </button>
        ))}
      </div>
      <button 
        onClick={() => onAdd(product, weight)}
        className="liquid-button w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2"
      >
        Добавить в корзину — {weight.price}р
      </button>
    </div>
  );
}
