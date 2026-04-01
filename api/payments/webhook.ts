import { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { supabaseAdmin } from '../../lib/supabaseAdmin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  try {
    const secret = process.env.NOWPAYMENTS_IPN_SECRET;
    const signature = req.headers['x-nowpayments-sig'];
    const payload = req.body;

    // 🔒 Validar webhook if secret is provided
    if (secret && signature) {
      const rawBody = JSON.stringify(payload, Object.keys(payload).sort());
      const hmac = crypto
        .createHmac('sha512', secret)
        .update(rawBody)
        .digest('hex');

      if (hmac !== signature) {
        console.log("❌ Assinatura inválida");
        return res.status(401).send('Invalid signature');
      }
    }

    console.log("📩 Webhook recebido:", payload);

    // Só processa pagamentos completos
    if (payload.payment_status !== 'finished') {
      return res.status(200).send('Ignored: Status is ' + payload.payment_status);
    }

    const orderId = payload.order_id;
    if (!orderId) {
      return res.status(400).send('Missing order_id');
    }

    // Extrair userId (formato: userId_timestamp)
    const userId = orderId.split('_')[0];
    if (!userId) {
      return res.status(400).send('Invalid order_id format');
    }

    // 💰 Converter USD → AngoCoins (1 USD = 100 AC)
    const amountUSD = parseFloat(payload.actually_paid || payload.price_amount);
    const coins = Math.floor(amountUSD * 100);

    // 🔥 Evitar duplicação se houver tabela de transações
    // Se não houver, apenas atualizamos o saldo
    try {
      const { data: existing } = await supabaseAdmin
        .from('transactions')
        .select('*')
        .eq('external_id', payload.payment_id)
        .single();

      if (existing) {
        return res.status(200).send('Already processed');
      }

      // 💾 Salvar transação
      await supabaseAdmin.from('transactions').insert({
        user_id: userId,
        amount: coins,
        external_id: payload.payment_id,
        type: 'deposit'
      });
    } catch (e) {
      console.log("Transactions table might not exist, skipping duplicate check");
    }

    // ➕ Atualizar saldo diretamente no perfil (mais robusto que RPC se não estiver criado)
    // Primeiro tentamos via RPC como solicitado
    try {
      const { error: rpcError } = await supabaseAdmin.rpc('increment_balance', {
        user_id: userId,
        amount: coins
      });

      if (rpcError) throw rpcError;
    } catch (rpcErr) {
      console.log("RPC increment_balance failed, falling back to direct update");
      
      // Fallback: Atualização direta
      const { data: profile, error: fetchError } = await supabaseAdmin
        .from('profiles')
        .select('balance')
        .eq('id', userId)
        .single();

      if (fetchError) throw fetchError;

      const newBalance = (profile?.balance || 0) + coins;

      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', userId);

      if (updateError) throw updateError;
    }

    console.log(`✅ Sucesso: Creditado ${coins} AC para o usuário ${userId}`);
    return res.status(200).send('OK');

  } catch (err: any) {
    console.error('Webhook error:', err);
    return res.status(500).send('Error: ' + err.message);
  }
}
