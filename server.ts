import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // NOWPayments API Endpoint
  app.post("/api/payments/create", async (req, res) => {
    const { amount, currency, orderId, orderDescription } = req.body;
    const apiKey = process.env.NOWPAYMENTS_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "NOWPayments API Key is not configured." });
    }

    try {
      const response = await fetch("https://api.nowpayments.io/v1/invoice", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          price_amount: amount,
          price_currency: currency || "usd",
          order_id: orderId,
          order_description: orderDescription || "Angochat AC Top-up",
          ipn_callback_url: `${process.env.APP_URL}/api/payments/webhook`,
          success_url: `${process.env.APP_URL}/?payment=success`,
          cancel_url: `${process.env.APP_URL}/?payment=cancel`,
        }),
      });

      const data = await response.json();
      
      if (data.invoice_url) {
        res.json({ invoice_url: data.invoice_url });
      } else {
        console.error("NOWPayments Error:", data);
        res.status(400).json({ error: data.message || "Failed to create invoice" });
      }
    } catch (error) {
      console.error("Payment creation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Webhook for payment status updates (simplified)
  app.post("/api/payments/webhook", async (req, res) => {
    // In a real app, you would verify the signature and update the user's balance in Supabase
    // via a service role client to bypass RLS if needed, or handle it securely.
    console.log("NOWPayments Webhook received:", req.body);
    res.status(200).send("OK");
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
