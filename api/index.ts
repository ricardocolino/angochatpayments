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
    
    const { amount, userId, orderDescription, pay_currency } = req.body;
    
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
      console.log(`Iniciando criação de pagamento direto: User=${userId}, Valor=${amount}, Currency=${pay_currency || 'btc'}`);
      
      const response = await fetch("https://api.nowpayments.io/v1/payment", {
        method: "POST",
        headers: { 
          "x-api-key": apiKey, 
          "Content-Type": "application/json" 
        },
        body: JSON.stringify({
          price_amount: amount,
          price_currency: "usd",
          pay_currency: pay_currency || "btc",
          order_id: `${userId}_${Date.now()}`,
          order_description: orderDescription || "Compra de AngoCoins",
          ipn_callback_url: `${baseUrl}/api/webhook`
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error("Erro na NOWPayments:", data);
        let errorMsg = data.message || data.error || (typeof data === 'string' ? data : JSON.stringify(data));
        
        // Tradução amigável para erro de valor mínimo
        if (errorMsg.includes('minimal') || data.code === 'AMOUNT_MINIMAL_ERROR') {
          errorMsg = `O valor escolhido é muito baixo para pagar com ${pay_currency?.toUpperCase() || 'BITCOIN'}. Por favor, escolha uma quantia maior ou troque a moeda.`;
        }

        return res.status(response.status).json({ 
          error: "A NOWPayments recusou o pedido.", 
          details: errorMsg 
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
      if (hmac !== signature) {
        console.error('Assinatura HMAC inválida no Webhook');
        return res.status(401).send('Invalid signature');
      }
    }

    const status = (payload.payment_status || '').toLowerCase();
    console.log(`Webhook NOWPayments recebido: Status=${status}, OrderID=${payload.order_id}, PriceAmount=${payload.price_amount}`);

    if (status === 'finished' || status === 'confirmed') {
      const orderId = payload.order_id;
      const userId = orderId?.split('_')[0];
      if (!userId) {
        console.error('Webhook erro: order_id inválido:', orderId);
        return res.status(400).send('Invalid order_id');
      }

      // IMPORTANTE: price_amount ou outcome_amount é o valor em USD (ex: 10, 0.1, 1).
      // actually_paid é a quantia em Cripto (ex: 0.00025 BTC). Usamos price_amount/outcome_amount para o cálculo em USD!
      const priceUSD = parseFloat(payload.price_amount || payload.outcome_amount || '0');
      const coins = Math.round(priceUSD * 100);

      if (coins <= 0) {
        console.warn(`Webhook aviso: 0 coins calculadas para o pedido ${orderId}`);
        return res.status(200).send('Zero coins');
      }

      try {
        const { data: profile, error: fetchError } = await supabaseAdmin
          .from('profiles')
          .select('balance')
          .eq('id', userId)
          .maybeSingle();
        
        if (fetchError) {
          console.error('Erro ao buscar perfil no Supabase:', fetchError);
        }

        const currentBalance = profile?.balance || 0;
        const newBalance = currentBalance + coins;

        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .upsert({ id: userId, balance: newBalance }, { onConflict: 'id' });

        if (updateError) {
          console.error('Erro ao atualizar saldo no Supabase:', updateError);
          throw updateError;
        }
        
        console.log(`✅ Sucesso: ${coins} AC creditados ao usuário ${userId}. Novo saldo: ${newBalance}`);
        return res.status(200).send('OK');
      } catch (err: any) {
        console.error('Erro no Supabase durante webhook:', err);
        return res.status(500).send('Error updating balance: ' + (err.message || err));
      }
    }

    return res.status(200).send('Ignored');
  }

  return res.status(404).json({ error: 'Rota não encontrada: ' + path });
}
