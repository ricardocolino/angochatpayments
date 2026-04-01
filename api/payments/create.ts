import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { amount, userId, orderDescription } = req.body;

    if (!amount || !userId) {
      return res.status(400).json({ error: 'Missing amount or userId' });
    }

    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'NOWPayments API Key is not configured' });
    }

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
        price_currency: "usd",
        order_id: `${userId}_${Date.now()}`,
        order_description: orderDescription || "Compra de AngoCoins",
        success_url: `${baseUrl}/?payment=success`,
        cancel_url: `${baseUrl}/?payment=cancel`,
        ipn_callback_url: `${baseUrl}/api/payments/webhook`
      }),
    });

    const data = await response.json();

    if (data.invoice_url) {
      return res.status(200).json(data);
    } else {
      return res.status(400).json({ error: data.message || 'Failed to create invoice', details: data });
    }

  } catch (err: any) {
    console.error('Create payment error:', err);
    return res.status(500).json({ error: err.message });
  }
}
