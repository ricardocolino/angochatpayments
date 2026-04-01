import express from "express";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(express.json());

// Lazy Supabase client helper
const getSupabase = () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase credentials (VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY) are missing.");
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
};

const AC_RATE = 100; // 1 USD = 100 AC

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "API is running" });
});

// NOWPayments API Endpoint
const createPayment = async (req, res) => {
  const { amount, currency, orderId, orderDescription } = req.body;
  const apiKey = process.env.NOWPAYMENTS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "NOWPayments API Key is not configured in Vercel environment variables." });
  }

  try {
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const baseUrl = process.env.APP_URL || `${protocol}://${host}`;

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
        ipn_callback_url: `${baseUrl}/api/payments/webhook`,
        success_url: `${baseUrl}/?payment=success`,
        cancel_url: `${baseUrl}/?payment=cancel`,
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
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
};

// Webhook for payment status updates
const handleWebhook = async (req, res) => {
  const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  const signature = req.headers["x-nowpayments-sig"];
  const payload = req.body;

  console.log("NOWPayments Webhook received:", payload);

  if (ipnSecret && signature) {
    const hmac = crypto.createHmac("sha512", ipnSecret);
    hmac.update(JSON.stringify(payload, Object.keys(payload).sort()));
    const expectedSignature = hmac.digest("hex");

    if (signature !== expectedSignature) {
      console.error("Invalid NOWPayments signature");
      return res.status(400).send("Invalid signature");
    }
  }

  if (payload.payment_status === "finished") {
    const orderId = payload.order_id;
    const parts = orderId.split("_");
    const userId = parts[parts.length - 1];
    const amountPaid = parseFloat(payload.actually_paid || payload.price_amount);
    const acToCredit = Math.floor(amountPaid * AC_RATE);

    if (!userId) {
      console.error("User ID not found in order_id:", orderId);
      return res.status(400).send("User ID not found");
    }

    try {
      const supabase = getSupabase();
      const { data: profile, error: fetchError } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", userId)
        .single();

      if (fetchError) throw fetchError;

      const newBalance = (profile?.balance || 0) + acToCredit;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ balance: newBalance })
        .eq("id", userId);

      if (updateError) throw updateError;

      console.log(`Successfully credited ${acToCredit} AC to user ${userId}. New balance: ${newBalance}`);
    } catch (error) {
      console.error("Error updating balance in Supabase:", error);
      return res.status(500).send("Error updating balance");
    }
  }

  res.status(200).send("OK");
};

// Register routes with and without /api prefix
app.post("/api/payments/create", createPayment);
app.post("/payments/create", createPayment);

app.post("/api/payments/webhook", handleWebhook);
app.post("/payments/webhook", handleWebhook);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

export default app;
