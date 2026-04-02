import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export default async function handler(req: any, res: any) {
  const path = req.url || '';
  
  // 1. Configuração do Supabase - Flexível com nomes de variáveis
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ROLE_KEY;
  
  // Log para depuração interna (não aparece para o usuário final, mas ajuda no log da Vercel)
  if (!supabaseUrl) console.error("ERRO: VITE_SUPABASE_URL ou SUPABASE_URL não encontrada.");
  if (!supabaseServiceKey) console.error("ERRO: SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ROLE_KEY não encontrada.");

  // --- ROTA: CRIAR PAGAMENTO ---
  if (path.includes('/create')) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    
    const { amount, userId, orderDescription } = req.body;
    
    // Validações básicas
    if (!amount || !userId) {
      return res.status(400).json({ error: 'Faltam dados: amount (valor) ou userId (ID do usuário) não enviados.' });
    }

    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'Configuração Incompleta: A variável NOWPAYMENTS_API_KEY não foi encontrada na Vercel.',
        tip: 'Certifique-se de que o nome da variável na Vercel é exatamente NOWPAYMENTS_API_KEY'
      });
    }

    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const baseUrl = process.env.APP_URL || `${protocol}://${host}`;

    try {
      console.log(`Iniciando criação de fatura: User=${userId}, Valor=${amount}`);
      
      const response = await fetch("https://api.nowpayments.io/v1/invoice", {
        method: "POST",
        headers: { 
          "x-api-key": apiKey, 
          "Content-Type": "application/json" 
        },
        body: JSON.stringify({
          price_amount: amount,
          price_currency: "usd",
          order_id: `${userId}_${Date.now()}`,
          order_description: orderDescription || "Compra de AngoCoins",
          currencies: ["usdttrc20", "usdterc20", "usdtbsc", "usdtpoly", "usdtsol"],
          is_fixed_rate: true,
          success_url: `${baseUrl}/?payment=success`,
          cancel_url: `${baseUrl}/?payment=cancel`,
          ipn_callback_url: `${baseUrl}/api/webhook`
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error("Erro na NOWPayments:", data);
        return res.status(response.status).json({ 
          error: "A NOWPayments recusou o pedido.", 
          details: data.message || data 
        });
      }

      return res.status(200).json(data);
    } catch (err: any) {
      console.error("Erro fatal ao criar pagamento:", err);
      return res.status(500).json({ error: "Erro interno ao processar o pagamento: " + err.message });
    }
  } 
  
  // --- ROTA: WEBHOOK (IPN) ---
  if (path.includes('/webhook')) {
    if (req.method !== 'POST') return res.status(405).send('Method not allowed');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Webhook falhou: Supabase não configurado.");
      return res.status(500).send('Supabase config missing');
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
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
        const { data: profile, error: fetchError } = await supabaseAdmin.from('profiles').select('balance').eq('id', userId).single();
        if (fetchError) throw fetchError;
        
        const newBalance = (profile?.balance || 0) + coins;
        const { error: updateError } = await supabaseAdmin.from('profiles').update({ balance: newBalance }).eq('id', userId);
        if (updateError) throw updateError;
        
        console.log(`✅ Sucesso: ${coins} AC creditados ao usuário ${userId}`);
        return res.status(200).send('OK');
      } catch (err: any) {
        console.error('Erro no Supabase durante webhook:', err);
        return res.status(500).send('Error updating balance');
      }
    }
    return res.status(200).send('Ignored');
  }

  return res.status(404).json({ error: 'Rota não encontrada: ' + path });
}
