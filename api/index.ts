import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
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

app.post("/api/payments/webhook", async (req, res) => {
  console.log("NOWPayments Webhook received:", req.body);
  res.status(200).send("OK");
});

export default app;
