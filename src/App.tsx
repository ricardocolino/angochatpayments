import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { 
  LogIn, 
  UserPlus, 
  LogOut, 
  User, 
  Mail, 
  Lock, 
  Loader2, 
  CheckCircle2, 
  Wallet, 
  PlusCircle, 
  CreditCard, 
  History,
  TrendingUp,
  Bitcoin
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  
  // Payment states
  const [selectedMethod, setSelectedMethod] = useState<string | null>('bitcoin');
  const [amountUSD, setAmountUSD] = useState<string>('');
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [isPaying, setIsPaying] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<{
    pay_address: string;
    pay_amount: number;
    pay_currency: string;
    payment_id: string;
  } | null>(null);

  const AC_RATE = 100; // 1 USD/USDT = 100 AC

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      setMessage('Pagamento iniciado com sucesso! O seu saldo será atualizado assim que a transação for confirmada na rede.');
      // Clear the URL params
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('payment') === 'cancel') {
      setError('O pagamento foi cancelado.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (data) setProfile(data);
    if (error) console.error('Error fetching profile:', error);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUp) {
        if (!username) throw new Error('Username is required');
        
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username }
          }
        });

        if (signUpError) throw signUpError;
        
        if (data.user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .insert([{ id: data.user.id, username, name: username, balance: 0 }]);
          
          if (profileError && profileError.code !== '23505') {
             console.error('Profile creation error:', profileError);
          }
        }
        setMessage('Cadastro realizado! Verifique seu email.');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (err: any) {
      setError(err.message || 'Erro na autenticação');
    } finally {
      setLoading(false);
    }
  };

  const handleTopUp = async () => {
    if (!amountUSD || isNaN(Number(amountUSD)) || Number(amountUSD) <= 0) {
      setError('Insira um valor válido em USD/USDT');
      return;
    }

    setIsPaying(true);
    setError(null);

    try {
      // Call our backend to create a NOWPayments invoice
      const response = await fetch('/api/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Number(amountUSD),
          userId: session.user.id,
          orderDescription: `Recarga de ${Number(amountUSD) * AC_RATE} AngoCoins para ${profile?.username}`,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('API Error Response:', text);
        throw new Error(`Erro no servidor (${response.status}). Verifique se as variáveis de ambiente (NOWPAYMENTS_API_KEY, etc) estão configuradas na Vercel.`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response:', text);
        throw new Error('O servidor retornou uma resposta inválida (não-JSON). Verifique se o arquivo vercel.json e a pasta api/ foram enviados corretamente.');
      }

      const data = await response.json();

      if (data.pay_address) {
        setPaymentDetails({
          pay_address: data.pay_address,
          pay_amount: data.pay_amount,
          pay_currency: data.pay_currency,
          payment_id: data.payment_id
        });
      } else if (data.invoice_url) {
        // Fallback para caso retorne invoice_url
        window.parent.postMessage({ type: 'OPEN_URL', url: data.invoice_url }, '*');
      } else {
        throw new Error(data.error || 'Erro ao gerar dados de pagamento');
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Erro ao processar pagamento via NOWPayments');
      setIsPaying(false);
    }
  };

  if (loading && !session) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-zinc-900 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F8F8] text-zinc-900 font-sans selection:bg-zinc-200">
      <main className="max-w-5xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {!session ? (
            <motion.div
              key="auth"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto"
            >
              <div className="bg-white border border-zinc-200 rounded-2xl p-8 shadow-sm">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-zinc-900">{isSignUp ? 'Criar Conta' : 'Acesse sua Carteira'}</h2>
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                  {isSignUp && (
                    <div className="space-y-1.5">
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                          type="text"
                          placeholder="Username"
                          required
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-zinc-900 transition-colors"
                        />
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input
                        type="email"
                        placeholder="Email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-zinc-900 transition-colors"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input
                        type="password"
                        placeholder="Senha"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-zinc-900 transition-colors"
                      />
                    </div>
                  </div>

                  {error && <div className="p-3 bg-zinc-50 border border-zinc-200 text-zinc-900 text-sm rounded-lg">{error}</div>}
                  {message && <div className="p-3 bg-zinc-50 border border-zinc-200 text-zinc-900 text-sm rounded-lg">{message}</div>}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-zinc-900 hover:bg-black text-white rounded-lg font-bold transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isSignUp ? 'Cadastrar' : 'Entrar na Conta')}
                  </button>
                </form>

                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="w-full mt-6 text-sm text-zinc-500 hover:text-black transition-colors"
                >
                  {isSignUp ? 'Já tem conta? Entre aqui' : 'Novo no Angochat? Crie sua conta'}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-2xl mx-auto"
            >
              <div className="flex flex-col items-center justify-center">
                <div className="bg-white border border-zinc-200 rounded-2xl p-6 sm:p-10 w-full max-w-xl shadow-sm">
                  {paymentDetails ? (
                    <div className="space-y-8">
                      <div className="flex flex-col items-center text-center space-y-2">
                        <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mb-2">
                          <Bitcoin className="w-8 h-8 text-zinc-900" />
                        </div>
                        <h3 className="text-xl font-black text-zinc-900">Pagamento Bitcoin</h3>
                        <p className="text-sm text-zinc-500">Envie o valor exato para o endereço abaixo</p>
                      </div>

                      <div className="flex flex-col items-center justify-center bg-zinc-50 rounded-2xl p-6 border border-zinc-100">
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${paymentDetails.pay_address}`}
                          alt="QR Code de Pagamento"
                          className="w-40 h-40 mb-4"
                        />
                        <div className="text-center">
                          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Valor a Enviar</p>
                          <p className="text-lg font-black text-zinc-900 uppercase">
                            {paymentDetails.pay_amount} {paymentDetails.pay_currency}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Endereço da Carteira</p>
                          <div className="flex items-center gap-2 p-4 bg-white border border-zinc-200 rounded-xl">
                            <span className="flex-1 font-mono text-[10px] break-all text-zinc-600">
                              {paymentDetails.pay_address}
                            </span>
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(paymentDetails.pay_address);
                                setMessage('Endereço copiado!');
                                setTimeout(() => setMessage(null), 2000);
                              }}
                              className="p-2 hover:bg-zinc-50 rounded-lg transition-colors"
                            >
                              <PlusCircle className="w-4 h-4 text-zinc-900 rotate-45" />
                            </button>
                          </div>
                        </div>

                        <div className="p-4 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">
                          <p className="text-[10px] text-zinc-500 leading-relaxed text-center">
                            O saldo será creditado automaticamente após a confirmação na rede blockchain (geralmente 10-30 min).
                          </p>
                        </div>

                        {message && <div className="p-4 bg-zinc-900 text-white text-[10px] font-bold text-center rounded-xl animate-in fade-in slide-in-from-bottom-2 uppercase tracking-widest">{message}</div>}

                        <button
                          onClick={() => setPaymentDetails(null)}
                          className="w-full py-4 border-2 border-zinc-900 text-zinc-900 rounded-xl font-bold transition-all hover:bg-zinc-50"
                        >
                          Voltar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-8">
                        <h3 className="text-lg font-black text-zinc-900">
                          @{profile?.username}
                        </h3>
                      </div>

                      <div className="space-y-8">
                        <div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {[1, 5, 10, 20].map((val) => (
                              <button 
                                key={val}
                                onClick={() => setAmountUSD(val.toString())}
                                className={`py-5 rounded-xl text-sm font-bold transition-all flex flex-col items-center border-2 ${
                                  amountUSD === val.toString() 
                                  ? 'bg-zinc-50 border-zinc-900 text-zinc-900' 
                                  : 'bg-white border-zinc-100 text-zinc-400 hover:bg-zinc-50 hover:border-zinc-200'
                                }`}
                              >
                                <span className="text-xs font-bold opacity-70 mb-1">{val * AC_RATE} AC</span>
                                <span className="text-xl font-black leading-none">$ {val}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {error && <div className="p-4 bg-zinc-50 border border-zinc-200 text-zinc-900 text-sm rounded-xl">{error}</div>}
                        {message && <div className="p-4 bg-zinc-50 border border-zinc-200 text-zinc-900 text-sm rounded-xl">{message}</div>}

                        <button
                          onClick={handleTopUp}
                          disabled={isPaying || !amountUSD}
                          className="w-full py-5 bg-zinc-900 hover:bg-black text-white rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3 disabled:opacity-50 mt-4"
                        >
                          {isPaying ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Recarregar Agora'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
