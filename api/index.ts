import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export default async function handler(req: any, res: any) {
  const path = req.url || '';
  
  // 1. Configuração do Supabase
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: "Erro: Credenciais do Supabase não configuradas na Vercel." });
  }
  
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // --- ROTA: CRIAR PAGAMENTO ---
  if (path.includes('/create')) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    
    const { amount, userId, orderDescription } = req.body;
    if (!amount || !userId) return res.status(400).json({ error: 'Faltam dados (amount ou userId)' });

    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Erro: NOWPAYMENTS_API_KEY não configurada.' });

    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const baseUrl = process.env.APP_URL || `${protocol}://${host}`;

    try {
      const response = await fetch("https://api.nowpayments.io/v1/invoice", {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          price_amount: amount,
          price_currency: "usd",
          order_id: `${userId}_${Date.now()}`,
          order_description: orderDescription || "Compra de AngoCoins",
          success_url: `${baseUrl}/?payment=success`,
          cancel_url: `${baseUrl}/?payment=cancel`,
          ipn_callback_url: `${baseUrl}/api/webhook`
        }),
      });
      const data = await response.json();
      return res.status(200).json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } 
  
  // --- ROTA: WEBHOOK (IPN) ---
  if (path.includes('/webhook')) {
    if (req.method !== 'POST') return res.status(405).send('Method not allowed');
    
    const secret = process.env.NOWPAYMENTS_IPN_SECRET;
    const signature = req.headers['x-nowpayments-sig'];
    const payload = req.body;

    if (secret && signature) {
      const rawBody = JSON.stringify(payload, Object.keys(payload).sort());
      const hmac = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
      if (hmac !== signature) return res.status(401).send('Invalid signature');
    }

    if (payload.payment_status === 'finished') {
      const orderId = payload.order_id;
      const userId = orderId?.split('_')[0];
      if (!userId) return res.status(400).send('Invalid order_id');

      const amountUSD = parseFloat(payload.actually_paid || payload.price_amount);
      const coins = Math.floor(amountUSD * 100);

      try {
        // Atualizar saldo diretamente
        const { data: profile } = await supabaseAdmin.from('profiles').select('balance').eq('id', userId).single();
        const newBalance = (profile?.balance || 0) + coins;
        await supabaseAdmin.from('profiles').update({ balance: newBalance }).eq('id', userId);
        
        console.log(`✅ Sucesso: ${coins} AC creditados ao usuário ${userId}`);
        return res.status(200).send('OK');
      } catch (err: any) {
        console.error('Erro no Supabase:', err);
        return res.status(500).send('Error updating balance');
      }
    }
    return res.status(200).send('Ignored');
  }

  return res.status(404).json({ error: 'Rota não encontrada: ' + path });
}
