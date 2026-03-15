/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from 'react';
import WebApp from '@twa-dev/sdk';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingCart, ChevronRight, Minus, Plus, X, Truck, Store, Info, Star, Zap } from 'lucide-react';
import { fetchProducts, fetchDeliveryOptions, fetchPromoCodes, fetchLoyaltyData } from './services/products';
import { Product, CartItem, DeliveryOption, ProductWeight, PromoCode } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
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

  const userId = WebApp.initDataUnsafe.user?.id?.toString() || 'guest';

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    
    const loadData = async () => {
      console.log('Current User ID:', userId);
      const [productsData, deliveryData, promoData, loyaltyData] = await Promise.all([
        fetchProducts(),
        fetchDeliveryOptions(),
        fetchPromoCodes(),
        fetchLoyaltyData()
      ]);
      setProducts(productsData);
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

  const confirmCheckout = () => {
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
    
    const encodedMessage = encodeURIComponent(message);
    const ownerUsername = 'bd77797';
    const url = `https://t.me/${ownerUsername}?text=${encodedMessage}`;
    
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
      <div className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white font-sans selection:bg-white/20">
      {/* Header */}
      <header className="sticky top-0 z-40 px-6 py-4 bg-[#0f172a]/80 backdrop-blur-xl border-b border-white/10 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsProfileOpen(true)}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-emerald-400 relative"
          >
            <Star size={20} fill={loyaltyPoints > 0 ? "currentColor" : "none"} />
            {loyaltyPoints > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0f172a]" />
            )}
          </button>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight">ODA EDA</h1>
            <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Premium Food</p>
          </div>
        </div>
        <button 
          onClick={() => setIsCartOpen(true)}
          className="relative p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
        >
          <ShoppingCart size={24} />
          {totalItems > 0 && (
            <span className="absolute -top-1 -right-1 bg-emerald-500 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-lg">
              {totalItems}
            </span>
          )}
        </button>
      </header>

      {/* Product List */}
      <main className="px-4 py-6 grid grid-cols-2 gap-3 pb-12">
        {products.map((product) => (
          <ProductCard 
            key={product.id} 
            product={product} 
            onAdd={addToCart} 
            onClick={() => setSelectedProduct(product)}
          />
        ))}
      </main>

      {/* Terms Button */}
      <div className="px-4 pb-32">
        <button 
          onClick={() => setIsTermsOpen(true)}
          className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between group hover:bg-white/10 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400">
              <Info size={20} />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold">Условия доставки и оплаты</p>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Важная информация</p>
            </div>
          </div>
          <ChevronRight size={20} className="text-white/20 group-hover:text-white/60 transition-colors" />
        </button>
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
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60]"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed inset-4 m-auto h-fit max-h-[80vh] bg-[#1e293b] rounded-[32px] z-[60] overflow-hidden flex flex-col border border-white/10 shadow-2xl"
            >
              <div className="relative h-64">
                <img src={selectedProduct.image} alt={selectedProduct.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                <button 
                  onClick={() => setSelectedProduct(null)}
                  className="absolute top-4 right-4 p-2 bg-black/40 backdrop-blur-md rounded-full text-white"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto">
                <h2 className="text-2xl font-bold">{selectedProduct.name}</h2>
                <div className="text-white/60 text-sm leading-relaxed whitespace-pre-wrap">
                  {selectedProduct.description || "Описание скоро появится..."}
                </div>
                <div className="pt-4 border-t border-white/5">
                  <ProductWeightSelector 
                    product={selectedProduct} 
                    onAdd={(p, w) => {
                      addToCart(p, w);
                      setSelectedProduct(null);
                    }} 
                  />
                </div>
              </div>
            </motion.div>
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
              className="fixed bottom-0 inset-x-0 bg-[#1e293b] rounded-t-[32px] z-50 max-h-[90vh] overflow-hidden flex flex-col border-t border-white/10 shadow-2xl"
            >
              <div className="p-6 flex justify-between items-center border-b border-white/5">
                <h2 className="text-xl font-bold">Оформление заказа</h2>
                <button onClick={() => setIsCartOpen(false)} className="p-2 bg-white/5 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {cart.length === 0 ? (
                  <div className="text-center py-12 text-white/40">
                    <ShoppingCart size={48} className="mx-auto mb-4 opacity-20" />
                    <p>Ваша корзина пуста</p>
                  </div>
                ) : (
                  <>
                    {/* Cart Items */}
                    <div className="space-y-4">
                      {cart.map((item) => (
                        <div key={`${item.id}-${item.selectedWeight.weight}`} className="flex items-center gap-4">
                          <img src={item.image} alt={item.name} className="w-16 h-16 rounded-xl object-cover bg-white/5" referrerPolicy="no-referrer" />
                          <div className="flex-1">
                            <h3 className="font-medium text-sm leading-tight">{item.name}</h3>
                            <p className="text-xs text-white/40 mt-1">{item.selectedWeight.weight} • {item.selectedWeight.price}р</p>
                          </div>
                          <div className="flex items-center gap-3 bg-white/5 rounded-full p-1">
                            <button onClick={() => removeFromCart(item.id, item.selectedWeight.weight)} className="w-8 h-8 flex items-center justify-center rounded-full"><Minus size={14} /></button>
                            <span className="text-sm font-medium">{item.quantity}</span>
                            <button onClick={() => addToCart(item, item.selectedWeight)} className="w-8 h-8 flex items-center justify-center rounded-full"><Plus size={14} /></button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Delivery Options */}
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Доставка</h3>
                      <div className="grid grid-cols-2 gap-3">
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
                                "flex flex-col items-start gap-2 p-4 rounded-2xl border transition-all relative overflow-hidden",
                                selectedDeliveryId === option.id ? "bg-emerald-500/10 border-emerald-500" : "bg-white/5 border-white/10"
                              )}
                            >
                            <div className="flex justify-between w-full items-center">
                              {option.type === 'pickup' ? <Store size={18} /> : <Truck size={18} />}
                              <span className="text-xs font-bold">{totalItems > 0 ? getDeliveryCostForOption(option) : option.price}р</span>
                            </div>
                            <span className="text-xs font-bold">{option.name}</span>
                            {getDeliveryConditionLabel(option) && (
                              <span className="text-[9px] text-white/40 leading-tight">{getDeliveryConditionLabel(option)}</span>
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
                          <button onClick={() => {setAppliedPromo(null); setPromoInput('');}} className="bg-red-500/20 text-red-400 px-4 rounded-xl"><X size={18} /></button>
                        ) : (
                          <button onClick={handleApplyPromo} className="bg-emerald-500 text-white px-6 rounded-xl font-bold text-sm">Применить</button>
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
                          "w-full p-4 rounded-2xl border flex justify-between items-center transition-all",
                          isLoyaltyApplied ? "bg-emerald-500/10 border-emerald-500" : "bg-white/5 border-white/10",
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
                              bargainPercent === p ? "bg-emerald-500 border-emerald-500" : "bg-white/5 border-white/10"
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
                        "w-full p-4 rounded-2xl border flex justify-between items-center transition-all",
                        isPriority ? "bg-amber-500/10 border-amber-500" : "bg-white/5 border-white/10"
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
                <div className="p-6 bg-white/5 border-t border-white/5 space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-white/60">
                      <span>Сумма</span>
                      <span>{subtotal}р</span>
                    </div>
                    {promoDiscount > 0 && (
                      <div className="flex justify-between text-sm text-emerald-400">
                        <span>Промокод ({appliedPromo?.code})</span>
                        <span>-{promoDiscount}р</span>
                      </div>
                    )}
                    {bargainDiscount > 0 && (
                      <div className="flex justify-between text-sm text-emerald-400">
                        <span>Торг ({bargainPercent || customBargain}%)</span>
                        <span>-{bargainDiscount}р</span>
                      </div>
                    )}
                    {loyaltyDiscount > 0 && (
                      <div className="flex justify-between text-sm text-emerald-400">
                        <span>Баллы</span>
                        <span>-{loyaltyDiscount}р</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm text-white/60">
                      <span>Доставка ({selectedDelivery?.name})</span>
                      <span>{deliveryCost}р</span>
                    </div>
                    {isPriority && (
                      <div className="flex justify-between text-sm text-amber-400">
                        <span>Приоритет</span>
                        <span>+100р</span>
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-bold pt-2 border-t border-white/5">
                      <span>Итого</span>
                      <span>{total}р</span>
                    </div>
                  </div>
                  <button 
                    onClick={handleCheckout}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
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
              className="fixed bottom-0 inset-x-0 bg-[#1e293b] rounded-t-[32px] z-[80] p-8 border-t border-white/10 shadow-2xl space-y-6"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Доставка и оплата</h2>
                <button onClick={() => setIsTermsOpen(false)} className="p-2 bg-white/5 rounded-full"><X size={20} /></button>
              </div>

              <div className="space-y-6">
                <section className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-400">Доставка на Тверскую, 22</h3>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-2">
                    <p className="text-sm leading-relaxed text-white/80">
                      Доставка осуществляется с <span className="text-white font-bold">Пн по Пт</span> через неделю после заказа.
                    </p>
                    <p className="text-xs text-white/40 italic">
                      Пример: заказали во вторник — забираете на следующей неделе в Пн-Вт.
                    </p>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400">Индивидуальная доставка</h3>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                    <p className="text-sm leading-relaxed text-white/80">
                      Приоритетные заказы с индивидуальной доставкой обсуждаются отдельно в личном чате.
                    </p>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Оплата</h3>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                    <p className="text-sm leading-relaxed text-white/80">
                      Предоплата <span className="text-white font-bold">50%</span> для подтверждения заказа. Оплата принимается <span className="text-white font-bold underline">только наличными</span>.
                    </p>
                  </div>
                </section>
              </div>

              <button 
                onClick={() => setIsTermsOpen(false)}
                className="w-full bg-white text-[#0f172a] py-4 rounded-2xl font-bold mt-4"
              >
                Понятно
              </button>
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
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="fixed bottom-0 inset-x-0 bg-[#1e293b] rounded-t-[32px] z-[70] p-8 border-t border-white/10 shadow-2xl space-y-8"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Профиль лояльности</h2>
                <button onClick={() => setIsProfileOpen(false)} className="p-2 bg-white/5 rounded-full"><X size={20} /></button>
              </div>

              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-8 text-center space-y-4">
                <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/40">
                  <Star size={40} fill="white" className="text-white" />
                </div>
                <div>
                  <p className="text-4xl font-black text-emerald-400">{loyaltyPoints}</p>
                  <p className="text-xs font-bold uppercase tracking-widest text-white/40">Доступных баллов</p>
                </div>
              </div>

              <div className="text-center">
                <p className="text-[10px] text-white/20 uppercase tracking-widest font-medium">
                  Версия: 1.0.5 (Обновлено: 14.03 23:20)
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-white/40">Как это работает?</h3>
                <div className="grid gap-3">
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex gap-4 items-center">
                    <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400 font-bold">3%</div>
                    <p className="text-xs text-white/60">Получайте 3% баллами с каждой подтвержденной покупки</p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex gap-4 items-center">
                    <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400 font-bold">15%</div>
                    <p className="text-xs text-white/60">Оплачивайте до 15% от суммы заказа накопленными баллами</p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex gap-4 items-center">
                    <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center text-amber-400 font-bold">3м</div>
                    <p className="text-xs text-white/60">Баллы действительны в течение 3 месяцев с момента начисления</p>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setIsProfileOpen(false)}
                className="w-full bg-white text-[#0f172a] py-4 rounded-2xl font-bold"
              >
                Понятно
              </button>
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
              className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100]"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed inset-6 m-auto h-fit bg-[#1e293b] rounded-[32px] z-[100] p-8 border border-white/10 shadow-2xl space-y-6"
            >
              <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto text-amber-500">
                <Info size={32} />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-bold">Важная информация</h2>
                <p className="text-white/60 text-sm">Для подтверждения заказа необходимо внести предоплату в размере <span className="text-white font-bold">50% ({Math.ceil(total / 2)}р)</span>.</p>
                <p className="text-white/60 text-sm">Оплата принимается <span className="text-white font-bold underline">только наличными</span>.</p>
              </div>
              <div className="space-y-3 pt-4">
                <button 
                  onClick={confirmCheckout}
                  className="w-full bg-emerald-500 py-4 rounded-2xl font-bold text-white shadow-lg shadow-emerald-500/20"
                >
                  Понятно, заказать
                </button>
                <button 
                  onClick={() => setShowPrepaymentInfo(false)}
                  className="w-full text-white/40 text-xs font-bold uppercase tracking-widest"
                >
                  Отмена
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Quick Summary Bar */}
      {totalItems > 0 && !isCartOpen && (
        <motion.div initial={{ y: 100 }} animate={{ y: 0 }} className="fixed bottom-6 inset-x-4 z-40">
          <button onClick={() => setIsCartOpen(true)} className="w-full bg-white/10 backdrop-blur-xl border border-white/20 p-4 rounded-2xl flex justify-between items-center shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500 p-2 rounded-xl"><ShoppingCart size={20} /></div>
              <div className="text-left">
                <p className="text-xs text-white/60 font-medium">{totalItems} поз.</p>
                <p className="font-bold">{total}р</p>
              </div>
            </div>
            <span className="text-xs font-bold uppercase tracking-widest bg-white/10 px-3 py-1 rounded-full border border-white/10">Корзина</span>
          </button>
        </motion.div>
      )}
    </div>
  );
}

const ProductCard: React.FC<{ product: Product; onAdd: (p: Product, w: ProductWeight) => void; onClick: () => void }> = ({ product, onAdd, onClick }) => {
  const [selectedWeightIdx, setSelectedWeightIdx] = useState(0);
  const selectedWeight = product.weights[selectedWeightIdx];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden flex flex-col"
    >
      <div className="relative aspect-square overflow-hidden group cursor-pointer" onClick={onClick}>
        <img src={product.image} alt={product.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" referrerPolicy="no-referrer" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-transparent to-transparent opacity-60" />
        <div className="absolute bottom-2 left-2 p-1.5 bg-black/40 backdrop-blur-md rounded-lg">
          <Info size={14} className="text-white/60" />
        </div>
      </div>

      <div className="p-3 space-y-2 flex-1 flex flex-col">
        <h3 className="text-sm font-bold leading-tight line-clamp-2 h-10 cursor-pointer" onClick={onClick}>{product.name}</h3>

        {product.weights.length > 1 && (
          <div className="flex flex-wrap gap-1 p-0.5 bg-white/5 rounded-lg self-start">
            {product.weights.map((w, idx) => (
              <button
                key={w.weight}
                onClick={(e) => { e.stopPropagation(); setSelectedWeightIdx(idx); }}
                className={cn(
                  "px-2 py-1 rounded-md text-[10px] font-bold transition-all",
                  selectedWeightIdx === idx ? "bg-white text-[#0f172a]" : "text-white/60"
                )}
              >
                {w.weight}
              </button>
            ))}
          </div>
        )}

        <div className="pt-1 mt-auto flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Цена</span>
            <span className="text-lg font-black text-emerald-400">{selectedWeight.price}р</span>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onAdd(product, selectedWeight); }}
            className="bg-white text-[#0f172a] p-2 rounded-xl hover:bg-emerald-400 transition-all active:scale-90"
          >
            <Plus size={18} />
          </button>
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
              "px-4 py-2 rounded-xl text-xs font-bold border transition-all",
              selectedIdx === idx ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white/5 border-white/10 text-white/60"
            )}
          >
            {w.weight} — {w.price}р
          </button>
        ))}
      </div>
      <button 
        onClick={() => onAdd(product, weight)}
        className="w-full bg-white text-[#0f172a] py-4 rounded-2xl font-bold flex items-center justify-center gap-2"
      >
        Добавить в корзину — {weight.price}р
      </button>
    </div>
  );
}
