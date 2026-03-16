# Orders Sheet Layout

Для листа `gid=1831701351` используй первую строку как заголовки:

```text
order_id,user_id,username,first_name,last_name,created_at,status,payment_status,paid_at,items_summary,cart_snapshot,subtotal,delivery_name,delivery_cost,total,paid_total,promo_code,promo_discount,bargain_discount,loyalty_discount,priority_fee,priority_enabled,comment
```

Рекомендуемые значения:

- `status`: `checkout_clicked`, `in_chat`, `confirmed`, `cancelled`
- `payment_status`: `pending`, `paid`, `declined`
- `paid_at`: дата фактической оплаты, заполняется вручную когда заказ реально оплачен
- `paid_total`: сумма реально оплаченного заказа; именно она участвует в расчёте баллов лояльности

Логика:

- Mini App пишет строку в этот лист в момент нажатия `Понятно, заказать`
- Ты вручную меняешь `payment_status` на `paid` и при необходимости заполняешь `paid_at`
- Личный кабинет считает баллы только по строкам со статусом оплаты `paid`

Подключение записи:

- Для записи из Mini App нужен webhook, который реально добавляет строки в Google Sheets
- Готовая заготовка Apps Script лежит в [google-sheets-orders-webhook.gs](/Users/bokovdenis/Downloads/oda-eda%20(5)/docs/google-sheets-orders-webhook.gs)
- После публикации этого Apps Script как Web App его URL нужно положить в переменную окружения `GOOGLE_SHEETS_WEBHOOK_URL`
- Если приложение задеплоено как статика без backend/webhook, лист будет оставаться пустым, даже если кнопка `заказать` нажимается
