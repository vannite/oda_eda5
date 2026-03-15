/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUpRight,
  ChevronRight,
  Info,
  MapPin,
  Minus,
  Plus,
  ShoppingCart,
  Sparkles,
  Star,
  Truck,
  X,
  Zap,
} from 'lucide-react';
import { fetchDeliveryOptions, fetchLoyaltyData, fetchProducts, fetchPromoCodes } from './services/products';
import { CartItem, DeliveryOption, Product, ProductWeight, PromoCode } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const OFFICE_ADDRESS = 'Тверская, 22';
const OWNER_USERNAME = 'bd77797';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function getApplicableDeliveryTier(option: DeliveryOption | undefined, totalItems: number) {
  if (!option?.tiers?.length || totalItems <= 0) return null;

  return [...option.tiers]
    .filter((tier) => {
      const minOk = tier.minItems === undefined || totalItems >= tier.minItems;
      const maxOk = tier.maxItems === undefined || totalItems <= tier.maxItems;
      return minOk && maxOk;
    })
    .sort((a, b) => (b.minItems || 0) - (a.minItems || 0))[0] || null;
}

function getDeliveryCostForOption(option: DeliveryOption | undefined, totalItems: number) {
  if (!option || totalItems <= 0) return 0;

  const tier = getApplicableDeliveryTier(option, totalItems);
  if (tier) return tier.perItem ? tier.price * totalItems : tier.price;

  return option.price;
}

function getDeliveryConditionLabel(option: DeliveryOption | undefined, totalItems: number) {
  return getApplicableDeliveryTier(option, totalItems)?.condition || option?.condition || '';
}

function copyOfficeAddress() {
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(OFFICE_ADDRESS).catch(() => undefined);
  }
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(null);
  const [isPriority, setIsPriority] = useState(false);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [isLoyaltyApplied, setIsLoyaltyApplied] = useState(false);
  const [bargainPercent, setBargainPercent] = useState<number | null>(null);
  const [customBargain, setCustomBargain] = useState('');
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showPrepaymentInfo, setShowPrepaymentInfo] = useState(false);

  const userId = WebApp.initDataUnsafe.user?.id?.toString() || 'guest';

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();

    const loadData = async () => {
      const [productsData, deliveryData, promoData, loyaltyData] = await Promise.all([
        fetchProducts(),
        fetchDeliveryOptions(),
        fetchPromoCodes(),
        fetchLoyaltyData(),
      ]);

      setProducts(productsData);
      setDeliveryOptions(deliveryData);
      setPromoCodes(promoData);

      const userRecords = loyaltyData.filter((record) => record.userId === userId);
      const totalPoints = userRecords.reduce((sum, record) => {
        const recordDate = new Date(record.date);
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        return recordDate > threeMonthsAgo ? sum + record.amount * 0.03 : sum;
      }, 0);

      setLoyaltyPoints(Math.floor(totalPoints));

      if (deliveryData.length > 0) {
        setSelectedDeliveryId(deliveryData[0].id);
      }

      setLoading(false);
    };

    void loadData();
  }, [userId]);

  const addToCart = (product: Product, selectedWeight: ProductWeight) => {
    setCart((prev) => {
      const existing = prev.find(
        (item) => item.id === product.id && item.selectedWeight.weight === selectedWeight.weight,
      );

      if (existing) {
        return prev.map((item) =>
          item.id === product.id && item.selectedWeight.weight === selectedWeight.weight
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      return [...prev, { ...product, selectedWeight, quantity: 1 }];
    });
    WebApp.HapticFeedback.impactOccurred('light');
  };

  const removeFromCart = (productId: string, weight: string) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === productId && item.selectedWeight.weight === weight);
      if (existing && existing.quantity > 1) {
        return prev.map((item) =>
          item.id === productId && item.selectedWeight.weight === weight
            ? { ...item, quantity: item.quantity - 1 }
            : item,
        );
      }

      return prev.filter((item) => !(item.id === productId && item.selectedWeight.weight === weight));
    });
    WebApp.HapticFeedback.impactOccurred('light');
  };

  const totalItems = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.selectedWeight.price * item.quantity, 0),
    [cart],
  );
  const selectedDelivery = useMemo(
    () => deliveryOptions.find((option) => option.id === selectedDeliveryId) || deliveryOptions[0],
    [deliveryOptions, selectedDeliveryId],
  );
  const deliveryCost = useMemo(
    () => getDeliveryCostForOption(selectedDelivery, totalItems),
    [selectedDelivery, totalItems],
  );
  const activeDeliveryCondition = useMemo(
    () => getDeliveryConditionLabel(selectedDelivery, totalItems),
    [selectedDelivery, totalItems],
  );

  const promoDiscount = useMemo(() => {
    if (!appliedPromo || isLoyaltyApplied) return 0;
    return appliedPromo.type === 'percent'
      ? Math.floor(subtotal * (appliedPromo.discount / 100))
      : appliedPromo.discount;
  }, [appliedPromo, isLoyaltyApplied, subtotal]);

  const bargainDiscount = useMemo(() => {
    if (appliedPromo || isLoyaltyApplied) return 0;
    const percent = bargainPercent || parseFloat(customBargain) || 0;
    return Math.floor(subtotal * (percent / 100));
  }, [appliedPromo, bargainPercent, customBargain, isLoyaltyApplied, subtotal]);

  const loyaltyDiscount = useMemo(() => {
    if (!isLoyaltyApplied || appliedPromo) return 0;
    const maxDiscount = Math.floor(subtotal * 0.15);
    return Math.min(loyaltyPoints, maxDiscount);
  }, [appliedPromo, isLoyaltyApplied, loyaltyPoints, subtotal]);

  const priorityFee = isPriority ? 100 : 0;
  const total = subtotal - promoDiscount - bargainDiscount - loyaltyDiscount + deliveryCost + priorityFee;

  const handleApplyPromo = () => {
    const normalizedInput = promoInput.trim().toLowerCase();
    if (!normalizedInput) {
      WebApp.showAlert('Введите промокод');
      return;
    }

    const usedPromos = JSON.parse(localStorage.getItem(`used_promos_${userId}`) || '[]');
    if (usedPromos.map((value: string) => value.toLowerCase()).includes(normalizedInput)) {
      WebApp.showAlert('Вы уже использовали этот промокод');
      return;
    }

    const promo = promoCodes.find((item) => item.code.toLowerCase() === normalizedInput);
    if (!promo) {
      WebApp.showAlert('Неверный промокод');
      return;
    }

    setAppliedPromo(promo);
    setIsLoyaltyApplied(false);
    setBargainPercent(null);
    setCustomBargain('');
    WebApp.HapticFeedback.notificationOccurred('success');
  };

  const handleCheckout = () => {
    if (cart.length === 0) return;
    setShowPrepaymentInfo(true);
  };

  const confirmCheckout = () => {
    const itemsText = cart
      .map(
        (item) =>
          `${item.name} (${item.selectedWeight.weight}) x${item.quantity} - ${
            item.selectedWeight.price * item.quantity
          }р`,
      )
      .join('\n');

    let message =
      (isPriority ? '!!! ПРИОРИТЕТНЫЙ ЗАКАЗ !!!\n\n' : '') +
      `Я хочу купить эти позиции на сумму ${total}р:\n\n${itemsText}\n\n` +
      `Доставка: ${selectedDelivery ? `${selectedDelivery.name} (${deliveryCost}р)` : 'Не выбрано'}\n` +
      `Сумма: ${subtotal}р\n`;

    if (promoDiscount > 0) message += `Промокод (${appliedPromo?.code}): -${promoDiscount}р\n`;
    if (bargainDiscount > 0) message += `Торг (${bargainPercent || customBargain}%): -${bargainDiscount}р\n`;
    if (loyaltyDiscount > 0) message += `Баллы лояльности: -${loyaltyDiscount}р\n`;
    if (priorityFee > 0) message += `Приоритетное обслуживание: +${priorityFee}р\n`;

    message += `\nИтого к оплате: ${total}р\n(Предоплата 50%: ${Math.ceil(total / 2)}р)`;

    if (appliedPromo) {
      const usedPromos = JSON.parse(localStorage.getItem(`used_promos_${userId}`) || '[]');
      localStorage.setItem(`used_promos_${userId}`, JSON.stringify([...usedPromos, appliedPromo.code]));
    }

    WebApp.openTelegramLink(`https://t.me/${OWNER_USERNAME}?text=${encodeURIComponent(message)}`);
    setShowPrepaymentInfo(false);
  };

  const featuredProduct = products[0];
  const accentProduct = products[1];

  if (loading) {
    return (
      <div className="app-shell min-h-screen text-white">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="ambient-orb ambient-orb-a" />
          <div className="ambient-orb ambient-orb-b" />
          <div className="ambient-orb ambient-orb-c" />
        </div>
        <div className="relative flex min-h-screen items-center justify-center px-6">
          <div className="glass-panel flex w-full max-w-sm flex-col items-center gap-5 px-8 py-10 text-center">
            <div className="floating-pill">
              <Sparkles size={16} />
              Загрузка меню
            </div>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
              className="h-14 w-14 rounded-full border-4 border-white/10 border-t-[#dbff4f]"
            />
            <div className="space-y-2">
              <p className="font-display text-3xl uppercase tracking-[0.18em] text-white/95">ODA EDA</p>
              <p className="text-sm text-white/60">Подготавливаем holographic-витрину и персональные условия заказа.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen text-white selection:bg-white/20">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="ambient-orb ambient-orb-a" />
        <div className="ambient-orb ambient-orb-b" />
        <div className="ambient-orb ambient-orb-c" />
        <div className="ambient-grid" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[480px] flex-col px-4 pb-32 pt-4">
        <header className="glass-panel sticky top-4 z-40 mb-5 flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setIsProfileOpen(true)}
            className="glass-chip h-11 w-11 justify-center rounded-full text-[#dbff4f]"
          >
            <Star size={18} fill={loyaltyPoints > 0 ? 'currentColor' : 'none'} />
          </button>

          <div className="text-center">
            <p className="font-display text-[1.55rem] uppercase tracking-[0.18em] text-white/95">ODA EDA</p>
            <p className="text-[10px] uppercase tracking-[0.38em] text-white/45">Liquid gourmet line</p>
          </div>

          <button
            onClick={() => setIsCartOpen(true)}
            className="glass-chip relative h-11 w-11 justify-center rounded-full text-white"
          >
            <ShoppingCart size={18} />
            {totalItems > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#dbff4f] px-1 text-[10px] font-extrabold text-[#090b14]">
                {totalItems}
              </span>
            )}
          </button>
        </header>

        <main className="space-y-5">
          <section className="hero-panel glass-panel overflow-hidden px-5 pb-5 pt-6">
            <div className="hero-noise" />
            <div className="relative z-10 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-[74%] space-y-3">
                  <div className="floating-pill w-fit">
                    <Sparkles size={15} />
                    Curated delicacies
                  </div>
                  <div className="space-y-2">
                    <h1 className="font-display text-[2.5rem] uppercase leading-[0.88] tracking-[0.08em] text-white">
                      Holo Taste
                      <br />
                      Delivery
                    </h1>
                    <p className="max-w-xs text-sm leading-relaxed text-white/68">
                      Витрина редких продуктов с liquid-glass подачей, быстрым заказом и понятной стоимостью доставки.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button onClick={() => setIsTermsOpen(true)} className="glass-chip rounded-full px-4 py-2 text-xs">
                    Условия
                    <ArrowUpRight size={14} />
                  </button>
                  <div className="glass-chip rounded-full px-4 py-2 text-xs">
                    <span className="h-2 w-2 rounded-full bg-[#7bffc7]" />
                    Меню онлайн
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[1.15fr_0.85fr] gap-3">
                <div className="glass-panel relative min-h-[230px] overflow-hidden rounded-[30px] p-4">
                  {featuredProduct ? (
                    <>
                      <img
                        src={featuredProduct.image}
                        alt={featuredProduct.name}
                        className="absolute inset-0 h-full w-full object-cover opacity-80"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,255,96,0.28),transparent_44%),linear-gradient(180deg,rgba(3,6,18,0.12),rgba(3,6,18,0.82))]" />
                      <div className="card-image-glow" />
                      <div className="absolute bottom-4 left-4 right-4">
                        <div className="glass-panel rounded-[24px] px-4 py-3">
                          <p className="text-[10px] uppercase tracking-[0.28em] text-white/45">Featured selection</p>
                          <p className="mt-2 line-clamp-2 text-base font-bold text-white">{featuredProduct.name}</p>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-sm text-white/55">
                              от {Math.min(...featuredProduct.weights.map((weight) => weight.price))}р
                            </span>
                            <button
                              onClick={() => setSelectedProduct(featuredProduct)}
                              className="liquid-button px-4 py-2 text-xs"
                            >
                              Смотреть
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full items-end justify-between rounded-[26px] bg-[radial-gradient(circle_at_top,_rgba(219,255,79,0.25),transparent_35%),linear-gradient(160deg,rgba(116,127,255,0.35),rgba(255,255,255,0.06))] p-4">
                      <div>
                        <p className="font-display text-2xl uppercase tracking-[0.16em]">Flavor Core</p>
                        <p className="mt-2 text-sm text-white/65">Здесь появится главное блюдо дня.</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  <StatTile label="В корзине" value={`${totalItems}`} sublabel="позиций" />
                  <StatTile label="Доставка" value={`${deliveryCost}р`} sublabel={activeDeliveryCondition || 'по корзине'} />
                  <div className="glass-panel relative min-h-[108px] overflow-hidden rounded-[26px] px-4 py-4">
                    <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(219,255,79,0.2),rgba(255,255,255,0.02)_55%,rgba(0,236,255,0.18))]" />
                    <div className="relative z-10 flex h-full flex-col justify-between">
                      <div className="floating-pill w-fit text-[10px]">
                        <MapPin size={12} />
                        Точка выдачи
                      </div>
                      <div>
                        <p className="font-display text-2xl uppercase leading-none tracking-[0.14em] text-white/95">
                          {OFFICE_ADDRESS}
                        </p>
                        <button
                          onClick={() => {
                            copyOfficeAddress();
                            WebApp.showAlert(`Адрес ${OFFICE_ADDRESS} скопирован`);
                          }}
                          className="mt-3 text-xs uppercase tracking-[0.22em] text-white/55 transition hover:text-white/80"
                        >
                          Копировать адрес
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <InfoTile title="Офис" value="100 / 75 / 50 / 0" caption="0-1, 2, 3-4, 5+" />
                <InfoTile title="Предоплата" value="50%" caption="наличными" />
                <InfoTile title="Лояльность" value={`${loyaltyPoints}`} caption="баллов доступно" />
              </div>
            </div>
          </section>

          <section className="glass-panel px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-kicker">Концепт</p>
                <h2 className="font-display text-2xl uppercase tracking-[0.12em] text-white">Neo gourmet catalog</h2>
              </div>
              {accentProduct && (
                <button onClick={() => setSelectedProduct(accentProduct)} className="glass-chip rounded-full px-4 py-2 text-xs">
                  Редкая позиция
                  <ArrowUpRight size={14} />
                </button>
              )}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            {products.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                index={index}
                onAdd={addToCart}
                onOpen={() => setSelectedProduct(product)}
              />
            ))}
          </section>

          <button onClick={() => setIsTermsOpen(true)} className="glass-panel flex w-full items-center justify-between gap-4 px-5 py-5 text-left">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(219,255,79,0.16)] text-[#dbff4f] shadow-[0_0_30px_rgba(219,255,79,0.2)]">
                <Info size={20} />
              </div>
              <div>
                <p className="font-display text-lg uppercase tracking-[0.12em] text-white">Delivery Protocol</p>
                <p className="text-sm text-white/58">Условия заказа, получения и оплаты в одном месте.</p>
              </div>
            </div>
            <ChevronRight size={20} className="text-white/35" />
          </button>
        </main>
      </div>

      <AnimatePresence>
        {selectedProduct && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProduct(null)}
              className="fixed inset-0 z-[60] bg-black/78 backdrop-blur-xl"
            />
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.97 }}
              className="fixed inset-x-4 top-[8vh] z-[61] mx-auto max-w-[460px]"
            >
              <div className="glass-panel overflow-hidden rounded-[34px]">
                <div className="relative h-72">
                  <img
                    src={selectedProduct.image}
                    alt={selectedProduct.name}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,11,20,0.06),rgba(9,11,20,0.78))]" />
                  <div className="absolute left-4 top-4">
                    <div className="floating-pill">
                      <Sparkles size={14} />
                      Product detail
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedProduct(null)}
                    className="glass-chip absolute right-4 top-4 h-11 w-11 justify-center rounded-full"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-5 px-5 py-5">
                  <div className="space-y-3">
                    <p className="section-kicker">Selected delicacy</p>
                    <h2 className="font-display text-[2rem] uppercase leading-[0.92] tracking-[0.08em] text-white">
                      {selectedProduct.name}
                    </h2>
                    <p className="text-sm leading-relaxed text-white/62">
                      {selectedProduct.description || 'Описание скоро появится. Пока можно оформить заказ напрямую из этой карточки.'}
                    </p>
                  </div>

                  <ProductWeightSelector product={selectedProduct} onAdd={addToCart} onDone={() => setSelectedProduct(null)} />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 24, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 z-[51] mx-auto flex max-h-[92vh] max-w-[480px] flex-col overflow-hidden rounded-t-[34px] border border-white/10 bg-[#090b14]/95 shadow-[0_-20px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
            >
              <div className="soft-divider px-5 pb-4 pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="section-kicker">Checkout</p>
                    <h2 className="font-display text-2xl uppercase tracking-[0.12em] text-white">Order capsule</h2>
                  </div>
                  <button onClick={() => setIsCartOpen(false)} className="glass-chip h-11 w-11 justify-center rounded-full">
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="scrollbar-hide flex-1 space-y-6 overflow-y-auto px-5 pb-5">
                {cart.length === 0 ? (
                  <div className="glass-panel flex flex-col items-center gap-4 rounded-[30px] px-6 py-12 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/8 text-white/55">
                      <ShoppingCart size={26} />
                    </div>
                    <div>
                      <p className="font-display text-2xl uppercase tracking-[0.12em] text-white">Корзина пуста</p>
                      <p className="mt-2 text-sm text-white/58">Добавь позиции из каталога, и здесь появится твой заказ.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <section className="space-y-3">
                      <SectionHeader title="Items" subtitle={`${totalItems} позиций в заказе`} />
                      <div className="space-y-3">
                        {cart.map((item) => (
                          <div key={`${item.id}-${item.selectedWeight.weight}`} className="glass-panel flex items-center gap-3 rounded-[26px] px-3 py-3">
                            <img
                              src={item.image}
                              alt={item.name}
                              className="h-20 w-20 rounded-[20px] object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 text-sm font-semibold text-white">{item.name}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/42">
                                {item.selectedWeight.weight} • {item.selectedWeight.price}р
                              </p>
                              <div className="mt-3 flex items-center gap-2">
                                <button
                                  onClick={() => removeFromCart(item.id, item.selectedWeight.weight)}
                                  className="glass-chip h-9 w-9 justify-center rounded-full"
                                >
                                  <Minus size={14} />
                                </button>
                                <span className="min-w-8 text-center text-sm font-bold text-white">{item.quantity}</span>
                                <button
                                  onClick={() => addToCart(item, item.selectedWeight)}
                                  className="glass-chip h-9 w-9 justify-center rounded-full"
                                >
                                  <Plus size={14} />
                                </button>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] uppercase tracking-[0.18em] text-white/38">Subtotal</p>
                              <p className="mt-1 text-base font-black text-[#dbff4f]">
                                {item.selectedWeight.price * item.quantity}р
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="space-y-3">
                      <SectionHeader title="Delivery" subtitle="Выбери подходящий сценарий получения" />
                      <div className="grid grid-cols-2 gap-3">
                        {deliveryOptions.map((option) => {
                          const currentPrice = getDeliveryCostForOption(option, totalItems);
                          const isSelected = selectedDeliveryId === option.id;
                          const label = getDeliveryConditionLabel(option, totalItems);

                          return (
                            <button
                              key={option.id}
                              onClick={() => {
                                setSelectedDeliveryId(option.id);
                                if (option.name === OFFICE_ADDRESS) {
                                  copyOfficeAddress();
                                  WebApp.HapticFeedback.notificationOccurred('success');
                                }
                              }}
                              className={cn(
                                'glass-panel flex min-h-[152px] flex-col items-start justify-between rounded-[26px] px-4 py-4 text-left transition duration-300',
                                isSelected && 'ring-1 ring-[#dbff4f] shadow-[0_0_40px_rgba(219,255,79,0.18)]',
                              )}
                            >
                              <div className="flex w-full items-center justify-between">
                                <div className="glass-chip rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em]">
                                  <Truck size={12} />
                                  Route
                                </div>
                                <span className="font-display text-xl uppercase tracking-[0.08em] text-[#dbff4f]">
                                  {currentPrice}р
                                </span>
                              </div>
                              <div className="space-y-2">
                                <p className="font-display text-xl uppercase leading-none tracking-[0.08em] text-white">
                                  {option.name}
                                </p>
                                <p className="text-xs leading-relaxed text-white/58">{label}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    <section className="space-y-3">
                      <SectionHeader title="Bonuses" subtitle="Промокоды, баллы и торг" />

                      <div className="glass-panel rounded-[26px] px-4 py-4">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={promoInput}
                            onChange={(event) => setPromoInput(event.target.value)}
                            placeholder="Промокод"
                            disabled={!!appliedPromo}
                            className="h-12 flex-1 rounded-2xl border border-white/10 bg-white/6 px-4 text-sm text-white placeholder:text-white/32 focus:border-[#dbff4f]/60 focus:outline-none disabled:opacity-50"
                          />
                          {appliedPromo ? (
                            <button
                              onClick={() => {
                                setAppliedPromo(null);
                                setPromoInput('');
                              }}
                              className="glass-chip h-12 w-12 justify-center rounded-2xl text-red-300"
                            >
                              <X size={18} />
                            </button>
                          ) : (
                            <button onClick={handleApplyPromo} className="liquid-button h-12 rounded-2xl px-5 text-sm">
                              Применить
                            </button>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          if (loyaltyPoints <= 0) return;
                          setIsLoyaltyApplied(!isLoyaltyApplied);
                          if (!isLoyaltyApplied) setAppliedPromo(null);
                        }}
                        disabled={loyaltyPoints === 0}
                        className={cn(
                          'glass-panel flex w-full items-center justify-between rounded-[26px] px-4 py-4 text-left transition',
                          isLoyaltyApplied && 'ring-1 ring-[#7bffc7]',
                          loyaltyPoints === 0 && 'opacity-55',
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(123,255,199,0.12)] text-[#7bffc7]">
                            <Star size={18} fill={isLoyaltyApplied ? 'currentColor' : 'none'} />
                          </div>
                          <div>
                            <p className="font-display text-lg uppercase tracking-[0.08em] text-white">Loyalty</p>
                            <p className="text-xs text-white/54">
                              {loyaltyPoints > 0 ? `Доступно ${loyaltyPoints} баллов, максимум 15%` : 'Баллы пока не начислены'}
                            </p>
                          </div>
                        </div>
                        {isLoyaltyApplied && <span className="text-sm font-bold text-[#7bffc7]">-{loyaltyDiscount}р</span>}
                      </button>

                      <div className="glass-panel space-y-3 rounded-[26px] px-4 py-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-display text-lg uppercase tracking-[0.08em] text-white">Bargain</p>
                            <p className="text-xs text-white/54">Работает, только если не включены промокод и баллы.</p>
                          </div>
                          {(appliedPromo || isLoyaltyApplied) && (
                            <span className="text-[10px] uppercase tracking-[0.16em] text-red-300">Заблокировано</span>
                          )}
                        </div>

                        <div className={cn('grid grid-cols-4 gap-2', (appliedPromo || isLoyaltyApplied) && 'pointer-events-none opacity-40')}>
                          {[3, 5, 7].map((value) => (
                            <button
                              key={value}
                              onClick={() => {
                                setBargainPercent(value);
                                setCustomBargain('');
                              }}
                              className={cn(
                                'rounded-2xl border px-3 py-3 text-xs font-bold transition',
                                bargainPercent === value
                                  ? 'border-[#dbff4f] bg-[rgba(219,255,79,0.18)] text-[#dbff4f]'
                                  : 'border-white/10 bg-white/6 text-white/70',
                              )}
                            >
                              {value}%
                            </button>
                          ))}
                          <input
                            type="number"
                            placeholder="%"
                            value={customBargain}
                            onChange={(event) => {
                              setCustomBargain(event.target.value);
                              setBargainPercent(null);
                            }}
                            className={cn(
                              'rounded-2xl border bg-white/6 px-3 text-center text-xs font-bold text-white placeholder:text-white/28 focus:outline-none',
                              customBargain ? 'border-[#dbff4f]' : 'border-white/10',
                            )}
                          />
                        </div>
                      </div>
                    </section>

                    <button
                      onClick={() => setIsPriority(!isPriority)}
                      className={cn(
                        'glass-panel flex w-full items-center justify-between rounded-[26px] px-4 py-4 text-left transition',
                        isPriority && 'ring-1 ring-[#ffb24f] shadow-[0_0_40px_rgba(255,178,79,0.14)]',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(255,178,79,0.12)] text-[#ffb24f]">
                          <Zap size={18} fill={isPriority ? 'currentColor' : 'none'} />
                        </div>
                        <div>
                          <p className="font-display text-lg uppercase tracking-[0.08em] text-white">Priority line</p>
                          <p className="text-xs text-white/54">Обработка в первую очередь и отдельное внимание к заказу.</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-[#ffb24f]">{isPriority ? '+100р' : 'off'}</span>
                    </button>
                  </>
                )}
              </div>

              {cart.length > 0 && (
                <div className="soft-divider space-y-4 px-5 pb-5 pt-4">
                  <div className="glass-panel rounded-[28px] px-4 py-4">
                    <SummaryRow label="Сумма" value={`${subtotal}р`} />
                    {promoDiscount > 0 && <SummaryRow label={`Промокод (${appliedPromo?.code})`} value={`-${promoDiscount}р`} accent="green" />}
                    {bargainDiscount > 0 && (
                      <SummaryRow label={`Торг (${bargainPercent || customBargain}%)`} value={`-${bargainDiscount}р`} accent="green" />
                    )}
                    {loyaltyDiscount > 0 && <SummaryRow label="Баллы" value={`-${loyaltyDiscount}р`} accent="green" />}
                    <SummaryRow label={`Доставка (${selectedDelivery?.name || 'не выбрано'})`} value={`${deliveryCost}р`} />
                    {isPriority && <SummaryRow label="Приоритет" value="+100р" accent="amber" />}
                    <div className="my-3 h-px bg-white/8" />
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Итого</p>
                        <p className="mt-1 text-sm text-white/55">Предоплата 50%: {Math.ceil(total / 2)}р</p>
                      </div>
                      <p className="font-display text-3xl uppercase tracking-[0.08em] text-white">{total}р</p>
                    </div>
                  </div>

                  <button onClick={handleCheckout} className="liquid-button flex h-14 w-full items-center justify-center gap-2 rounded-[22px] text-sm font-bold">
                    Оформить заказ
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isTermsOpen && (
          <ModalCard onClose={() => setIsTermsOpen(false)}>
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="section-kicker">Delivery protocol</p>
                <h2 className="font-display text-[2rem] uppercase leading-[0.92] tracking-[0.08em] text-white">
                  Условия доставки и оплаты
                </h2>
              </div>

              <InfoSection
                title="Офис на Тверской"
                accent="text-[#dbff4f]"
                body="Стоимость зависит от количества товаров в корзине: 0-1 товар — 100р, 2 товара — 75р, 3-4 товара — 50р, от 5 товаров — бесплатно."
              />
              <InfoSection
                title="График"
                accent="text-[#7bffc7]"
                body="Доставка на Тверскую, 22 происходит с понедельника по пятницу примерно через неделю после оформления заказа."
              />
              <InfoSection
                title="Индивидуальная доставка"
                accent="text-[#ffb24f]"
                body="Стоимость индивидуальной доставки берется из таблицы, а приоритетные заказы обсуждаются отдельно в личном чате."
              />
              <InfoSection
                title="Оплата"
                accent="text-white"
                body={`Для подтверждения заказа нужна предоплата 50% (${Math.ceil(total / 2)}р), оплата принимается только наличными.`}
              />

              <button onClick={() => setIsTermsOpen(false)} className="liquid-button flex h-14 w-full items-center justify-center rounded-[22px] text-sm font-bold">
                Понятно
              </button>
            </div>
          </ModalCard>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isProfileOpen && (
          <ModalCard onClose={() => setIsProfileOpen(false)}>
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="section-kicker">Profile</p>
                <h2 className="font-display text-[2rem] uppercase leading-[0.92] tracking-[0.08em] text-white">
                  Loyalty capsule
                </h2>
              </div>

              <div className="glass-panel rounded-[30px] px-5 py-6 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[radial-gradient(circle,rgba(219,255,79,0.32),rgba(219,255,79,0.08)_55%,transparent_70%)] text-[#dbff4f]">
                  <Star size={32} fill="currentColor" />
                </div>
                <p className="mt-4 font-display text-5xl uppercase tracking-[0.08em] text-white">{loyaltyPoints}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.28em] text-white/40">Доступных баллов</p>
              </div>

              <InfoSection
                title="Как начисляются"
                accent="text-[#7bffc7]"
                body="Каждая подходящая покупка добавляет 3% от суммы в баллы. Начисления за последние 3 месяца суммируются автоматически."
              />
              <InfoSection
                title="Как списываются"
                accent="text-[#dbff4f]"
                body="Баллами можно оплатить до 15% стоимости заказа. При включении списания промокод автоматически отключается."
              />
              <InfoSection
                title="Статус"
                accent="text-white"
                body="Текущая версия интерфейса сохранена в резерве, так что можно смело экспериментировать со стилем и быстро откатываться назад."
              />

              <button onClick={() => setIsProfileOpen(false)} className="liquid-button flex h-14 w-full items-center justify-center rounded-[22px] text-sm font-bold">
                Понятно
              </button>
            </div>
          </ModalCard>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPrepaymentInfo && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[90] bg-black/82 backdrop-blur-xl"
            />
            <motion.div
              initial={{ y: 24, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.96 }}
              className="fixed inset-x-4 top-[20vh] z-[91] mx-auto max-w-[420px]"
            >
              <div className="glass-panel rounded-[32px] px-6 py-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(255,178,79,0.16)] text-[#ffb24f]">
                  <Info size={28} />
                </div>
                <div className="mt-5 space-y-2">
                  <p className="font-display text-2xl uppercase tracking-[0.1em] text-white">Prepayment check</p>
                  <p className="text-sm leading-relaxed text-white/62">
                    Для подтверждения заказа нужна предоплата <span className="font-bold text-white">50% ({Math.ceil(total / 2)}р)</span>.
                  </p>
                  <p className="text-sm text-white/56">Оплата принимается только наличными.</p>
                </div>
                <div className="mt-6 space-y-3">
                  <button onClick={confirmCheckout} className="liquid-button flex h-14 w-full items-center justify-center rounded-[22px] text-sm font-bold">
                    Понятно, заказать
                  </button>
                  <button
                    onClick={() => setShowPrepaymentInfo(false)}
                    className="ghost-button flex h-12 w-full items-center justify-center rounded-[18px] text-xs uppercase tracking-[0.18em]"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {totalItems > 0 && !isCartOpen && (
        <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="fixed bottom-4 left-0 right-0 z-40 mx-auto max-w-[480px] px-4">
          <button onClick={() => setIsCartOpen(true)} className="glass-panel flex w-full items-center justify-between gap-4 rounded-[28px] px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(219,255,79,0.16)] text-[#dbff4f]">
                <ShoppingCart size={20} />
              </div>
              <div className="text-left">
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{totalItems} позиций</p>
                <p className="font-display text-2xl uppercase tracking-[0.08em] text-white">{total}р</p>
              </div>
            </div>
            <div className="glass-chip rounded-full px-4 py-2 text-xs">
              Корзина
              <ChevronRight size={14} />
            </div>
          </button>
        </motion.div>
      )}
    </div>
  );
}

const ProductCard: React.FC<{
  product: Product;
  index: number;
  onAdd: (product: Product, weight: ProductWeight) => void;
  onOpen: () => void;
}> = ({ product, index, onAdd, onOpen }) => {
  const [selectedWeightIdx, setSelectedWeightIdx] = useState(0);
  const selectedWeight = product.weights[selectedWeightIdx];

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ delay: Math.min(index * 0.04, 0.16), duration: 0.45 }}
      className="glass-panel group overflow-hidden rounded-[28px]"
    >
      <button onClick={onOpen} className="relative block aspect-[0.82] w-full overflow-hidden text-left">
        <img
          src={product.image}
          alt={product.name}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,11,20,0.08),rgba(9,11,20,0.76))]" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="glass-panel rounded-[22px] px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-semibold text-white">{product.name}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/42">Tap for detail</p>
              </div>
              <div className="floating-pill shrink-0 text-[10px]">
                <Sparkles size={12} />
                {product.weights.length} веса
              </div>
            </div>
          </div>
        </div>
      </button>

      <div className="space-y-3 px-3 pb-3 pt-3">
        {product.weights.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {product.weights.map((weight, idx) => (
              <button
                key={weight.weight}
                onClick={() => setSelectedWeightIdx(idx)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[11px] font-semibold transition',
                  idx === selectedWeightIdx
                    ? 'border-[#dbff4f] bg-[rgba(219,255,79,0.18)] text-[#dbff4f]'
                    : 'border-white/10 bg-white/6 text-white/62',
                )}
              >
                {weight.weight}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/36">Цена</p>
            <p className="font-display text-2xl uppercase tracking-[0.06em] text-[#dbff4f]">{selectedWeight.price}р</p>
          </div>
          <button onClick={() => onAdd(product, selectedWeight)} className="liquid-button h-11 rounded-2xl px-4 text-sm">
            <Plus size={16} />
            В корзину
          </button>
        </div>
      </div>
    </motion.article>
  );
};

const ProductWeightSelector: React.FC<{
  product: Product;
  onAdd: (product: Product, weight: ProductWeight) => void;
  onDone: () => void;
}> = ({ product, onAdd, onDone }) => {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selectedWeight = product.weights[selectedIdx];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {product.weights.map((weight, idx) => (
          <button
            key={weight.weight}
            onClick={() => setSelectedIdx(idx)}
            className={cn(
              'rounded-full border px-4 py-2 text-xs font-semibold transition',
              selectedIdx === idx
                ? 'border-[#dbff4f] bg-[rgba(219,255,79,0.18)] text-[#dbff4f]'
                : 'border-white/10 bg-white/6 text-white/64',
            )}
          >
            {weight.weight} • {weight.price}р
          </button>
        ))}
      </div>

      <button
        onClick={() => {
          onAdd(product, selectedWeight);
          onDone();
        }}
        className="liquid-button flex h-14 w-full items-center justify-center rounded-[22px] text-sm font-bold"
      >
        Добавить в корзину — {selectedWeight.price}р
      </button>
    </div>
  );
};

const ModalCard: React.FC<{ children: React.ReactNode; onClose: () => void }> = ({ children, onClose }) => (
  <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[80] bg-black/76 backdrop-blur-xl"
    />
    <motion.div
      initial={{ y: 30, opacity: 0, scale: 0.97 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 26, opacity: 0, scale: 0.97 }}
      className="fixed inset-x-4 top-[8vh] z-[81] mx-auto max-w-[420px]"
    >
      <div className="glass-panel relative rounded-[34px] px-5 py-5">
        <button onClick={onClose} className="glass-chip absolute right-4 top-4 h-11 w-11 justify-center rounded-full">
          <X size={18} />
        </button>
        <div className="pt-8">{children}</div>
      </div>
    </motion.div>
  </>
);

const SectionHeader: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <div>
    <p className="section-kicker">{subtitle}</p>
    <h3 className="font-display text-xl uppercase tracking-[0.1em] text-white">{title}</h3>
  </div>
);

const SummaryRow: React.FC<{ label: string; value: string; accent?: 'green' | 'amber' }> = ({ label, value, accent }) => (
  <div className="mt-2 flex items-center justify-between gap-3 text-sm">
    <span className="text-white/56">{label}</span>
    <span
      className={cn(
        'font-semibold text-white',
        accent === 'green' && 'text-[#7bffc7]',
        accent === 'amber' && 'text-[#ffb24f]',
      )}
    >
      {value}
    </span>
  </div>
);

const StatTile: React.FC<{ label: string; value: string; sublabel: string }> = ({ label, value, sublabel }) => (
  <div className="glass-panel relative flex min-h-[108px] flex-col justify-between rounded-[26px] px-4 py-4">
    <div className="floating-pill w-fit text-[10px]">{label}</div>
    <div>
      <p className="font-display text-[2rem] uppercase leading-none tracking-[0.08em] text-white">{value}</p>
      <p className="mt-2 text-xs text-white/54">{sublabel}</p>
    </div>
  </div>
);

const InfoTile: React.FC<{ title: string; value: string; caption: string }> = ({ title, value, caption }) => (
  <div className="glass-panel rounded-[24px] px-3 py-4">
    <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">{title}</p>
    <p className="mt-3 font-display text-xl uppercase leading-none tracking-[0.08em] text-white">{value}</p>
    <p className="mt-2 text-[11px] leading-relaxed text-white/48">{caption}</p>
  </div>
);

const InfoSection: React.FC<{ title: string; body: string; accent: string }> = ({ title, body, accent }) => (
  <div className="glass-panel rounded-[28px] px-4 py-4">
    <p className={cn('font-display text-lg uppercase tracking-[0.08em]', accent)}>{title}</p>
    <p className="mt-2 text-sm leading-relaxed text-white/62">{body}</p>
  </div>
);
