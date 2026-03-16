import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SHEET_ID = "1oXwz2zznkpY10M5GumIET6E96TjEEMd3jISM4FUy2f0";
const GOOGLE_SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL || "";

const SHEET_URLS = {
  products: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`,
  delivery: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=115101300`,
  promo: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=1982833599`,
  loyalty: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=1519224442`,
  orders: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=1831701351`,
} as const;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Basic health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/sheets/:sheet", async (req, res) => {
    const sheet = req.params.sheet as keyof typeof SHEET_URLS;
    const targetUrl = SHEET_URLS[sheet];

    if (!targetUrl) {
      res.status(404).json({ error: "Unknown sheet" });
      return;
    }

    try {
      const response = await fetch(`${targetUrl}&_=${Date.now()}`, {
        headers: {
          "cache-control": "no-cache",
          pragma: "no-cache",
        },
      });

      if (!response.ok) {
        throw new Error(`Google Sheets responded with ${response.status}`);
      }

      const csv = await response.text();
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.send(csv);
    } catch (error) {
      console.error(`Sheet proxy failed for ${sheet}:`, error);
      res.status(502).json({ error: "Failed to fetch sheet" });
    }
  });

  app.post("/api/orders", async (req, res) => {
    if (!GOOGLE_SHEETS_WEBHOOK_URL) {
      res.status(501).json({
        error: "Order logging webhook is not configured",
        requiredEnv: "GOOGLE_SHEETS_WEBHOOK_URL",
      });
      return;
    }

    try {
      const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body),
      });

      const text = await response.text();

      if (!response.ok) {
        res.status(502).json({
          error: "Failed to write order to Google Sheets",
          details: text,
        });
        return;
      }

      res.status(200).json({
        ok: true,
        upstream: text,
      });
    } catch (error) {
      console.error("Order logging failed:", error);
      res.status(502).json({ error: "Order logging failed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
