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
      console.error("Webhook falhou: Supabase URL ou Service Role Key faltando.");
      return res.status(500).json({ error: 'Supabase config missing (SUPABASE_SERVICE_ROLE_KEY required)' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const secret = process.env.NOWPAYMENTS_IPN_SECRET;
    const signature = req.headers['x-nowpayments-sig'];
    const payload = req.body || {};

    console.log("=== Webhook NOWPayments Recebido ===");
    console.log("Headers:", JSON.stringify(req.headers));
    console.log("Payload:", JSON.stringify(payload));

    if (secret && signature) {
      try {
        const rawBody = JSON.stringify(payload, Object.keys(payload).sort());
        const hmac = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
        if (hmac !== signature) {
          console.error(`Assinatura HMAC inválida no Webhook. Calculado: ${hmac}, Recebido: ${signature}`);
          return res.status(401).json({ error: 'Invalid HMAC signature' });
        }
      } catch (err: any) {
        console.error("Erro na validação de assinatura HMAC:", err);
      }
    }

    const status = (payload.payment_status || '').toLowerCase();
    console.log(`Status do Pagamento: ${status}, Order ID: ${payload.order_id}`);

    if (['finished', 'confirmed', 'partially_paid'].includes(status)) {
      const orderId = payload.order_id;
      let userId = orderId?.split('_')[0];
      
      // Fallback para caso order_id seja apenas o próprio userId
      if (!userId || userId.length < 10) {
        userId = orderId;
      }

      if (!userId) {
        console.error('Webhook erro: order_id inválido ou ausente:', orderId);
        return res.status(400).json({ error: 'Invalid order_id' });
      }

      // IMPORTANTE: Tenta obter o valor em USD por vários campos do NOWPayments
      const rawPrice = payload.price_amount ?? payload.outcome_amount ?? payload.actually_paid_at_fiat ?? payload.amount ?? '0';
      const priceUSD = parseFloat(rawPrice.toString());
      const coins = Math.round(priceUSD * 100);

      console.log(`Cálculo de coins: rawPrice=${rawPrice}, priceUSD=${priceUSD}, coins=${coins} para userId=${userId}`);

      if (coins <= 0) {
        console.warn(`Webhook aviso: 0 coins calculadas para o pedido ${orderId}`);
        // Registrar log de aviso para o usuário
        try {
          await supabaseAdmin.from('payment_logs').insert({
            user_id: userId,
            order_id: orderId,
            status: 'warning',
            message: 'Webhook recebido, mas o valor calculado em USD foi 0.',
            coins: 0
          });
        } catch (_) {}
        return res.status(200).json({ message: 'Zero coins' });
      }

      try {
        const { data: profile, error: fetchError } = await supabaseAdmin
          .from('profiles')
          .select('id, balance')
          .eq('id', userId)
          .maybeSingle();
        
        if (fetchError) {
          console.error('Erro ao buscar perfil no Supabase:', fetchError);
        }

        const currentBalance = profile?.balance != null ? parseFloat(profile.balance.toString()) : 0;
        const newBalance = Math.round((currentBalance + coins) * 100) / 100;

        if (profile) {
          const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update({ balance: newBalance })
            .eq('id', userId);

          if (updateError) {
            console.error('Erro ao atualizar saldo no Supabase:', updateError);
            throw updateError;
          }
        } else {
          // Tenta criar o perfil com id e balance (e username se suportado)
          const { error: insertError } = await supabaseAdmin
            .from('profiles')
            .insert({ 
              id: userId, 
              balance: newBalance,
              username: `user_${userId.slice(0, 8)}`
            });

          if (insertError) {
            console.warn('Erro com username, tentando criar perfil apenas com id e balance:', insertError);
            const { error: fallbackError } = await supabaseAdmin
              .from('profiles')
              .insert({ id: userId, balance: newBalance });

            if (fallbackError) {
              console.error('Erro ao criar perfil no Supabase:', fallbackError);
              throw fallbackError;
            }
          }
        }
        
        // Tenta gravar log de sucesso na tabela payment_logs
        try {
          await supabaseAdmin.from('payment_logs').insert({
            user_id: userId,
            order_id: orderId,
            status: 'success',
            message: `Pagamento confirmado! ${coins} AC creditados com sucesso.`,
            coins: coins
          });
        } catch (_) {}

        console.log(`✅ Sucesso: ${coins} AC creditados ao usuário ${userId}. Saldo anterior: ${currentBalance}, Novo saldo: ${newBalance}`);
        return res.status(200).json({ status: 'success', userId, addedCoins: coins, previousBalance: currentBalance, newBalance });
      } catch (err: any) {
        console.error('Erro no Supabase durante webhook:', err);
        // Tenta registrar o erro para o usuário
        try {
          await supabaseAdmin.from('payment_logs').insert({
            user_id: userId,
            order_id: orderId,
            status: 'error',
            message: `Erro ao creditar saldo: ${err.message || 'Erro no banco de dados'}`,
            coins: 0
          });
        } catch (_) {}
        return res.status(500).json({ error: 'Error updating balance: ' + (err.message || err) });
      }
    } else if (['failed', 'refunded', 'expired'].includes(status)) {
      const orderId = payload.order_id;
      let userId = orderId?.split('_')[0];
      if (userId) {
        try {
          await supabaseAdmin.from('payment_logs').insert({
            user_id: userId,
            order_id: orderId,
            status: 'failed',
            message: `O pagamento falhou ou expirou na NOWPayments (Status: ${status}).`,
            coins: 0
          });
        } catch (_) {}
      }
    }

    return res.status(200).json({ message: `Ignored status: ${status}` });
  }

  return res.status(404).json({ error: 'Rota não encontrada: ' + path });
}
