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
  Bitcoin,
  Copy,
  CheckCheck,
  Coins
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const AngoCoinIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <div className={`relative inline-flex items-center justify-center rounded-full bg-gradient-to-b from-[#FFE57F] via-[#FFD740] to-[#FFC400] border border-[#FFAB00] shadow-[0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.6)] ${className}`}>
    <div className="absolute inset-[1px] rounded-full border border-[#FFD54F]/50" />
    <svg viewBox="0 0 24 24" className="w-[65%] h-[65%] text-[#8A6508]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="10" r="4" />
      <path d="M9 14c-1.5 1-2.5 2-3 3.5" />
      <path d="M15 14c1.5 1 2.5 2 3 3.5" />
      <path d="M12 14v4" />
      <path d="M8 11c-1.5 0-3 1-3.5 2" />
      <path d="M16 11c1.5 0 3 1 3.5 2" />
    </svg>
  </div>
);

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
  const [selectedCurrency, setSelectedCurrency] = useState<'btc' | 'usdtbsc'>('usdtbsc');
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

  const CURRENCIES = [
    { id: 'usdtbsc', name: 'USDT (BEP20)', icon: Wallet, color: 'text-zinc-900' },
    { id: 'btc', name: 'Bitcoin', icon: Bitcoin, color: 'text-zinc-900' }
  ] as const;

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
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Session error:', error);
        supabase.auth.signOut();
        setLoading(false);
        return;
      }
      setSession(session);
      if (session) fetchProfile(session.user.id);
      setLoading(false);
    }).catch(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (data) setProfile(data);
      if (error) {
        if (error.code === 'PGRST116') {
          // Profile not found - might need to create it
          console.warn('Profile not found for user:', userId);
        } else {
          console.error('Error fetching profile:', error);
        }
      }
    } catch (err) {
      console.error('Unexpected error fetching profile:', err);
    }
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
          pay_currency: selectedCurrency,
          orderDescription: `Recarga de ${Number(amountUSD) * AC_RATE} AngoCoins para ${profile?.username}`,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const details = data.details || data.error || 'Erro desconhecido';
        console.error('API Error Response:', data);
        throw new Error(details);
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
                          {paymentDetails.pay_currency === 'btc' ? (
                            <Bitcoin className="w-8 h-8 text-zinc-900" />
                          ) : (
                            <Wallet className="w-8 h-8 text-zinc-900" />
                          )}
                        </div>
                        <h3 className="text-xl font-black text-zinc-900">
                          Pagamento {paymentDetails.pay_currency === 'btc' ? 'Bitcoin' : 'USDT (BEP20)'}
                        </h3>
                        <p className="text-sm text-zinc-500">Envie o valor exato para o endereço abaixo</p>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Valor a Enviar</p>
                          <div 
                            onClick={() => {
                              navigator.clipboard.writeText(paymentDetails.pay_amount.toString());
                              setMessage('Valor copiado!');
                              setTimeout(() => setMessage(null), 2000);
                            }}
                            className="flex items-center gap-2 p-4 bg-zinc-50 border border-zinc-200 rounded-xl cursor-pointer hover:bg-zinc-100 transition-colors group"
                          >
                            <span className="flex-1 font-black text-lg text-zinc-900">
                              {paymentDetails.pay_amount} {paymentDetails.pay_currency?.toUpperCase()}
                            </span>
                            <div className="p-2 bg-white rounded-lg shadow-sm border border-zinc-100 group-hover:border-zinc-300">
                              <Copy className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900" />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Endereço da Carteira</p>
                          <div 
                            onClick={() => {
                              navigator.clipboard.writeText(paymentDetails.pay_address);
                              setMessage('Endereço copiado!');
                              setTimeout(() => setMessage(null), 2000);
                            }}
                            className="flex items-center gap-2 p-4 bg-zinc-50 border border-zinc-200 rounded-xl cursor-pointer hover:bg-zinc-100 transition-colors group"
                          >
                            <span className="flex-1 font-mono text-[10px] break-all text-zinc-600">
                              {paymentDetails.pay_address}
                            </span>
                            <div className="p-2 bg-white rounded-lg shadow-sm border border-zinc-100 group-hover:border-zinc-300">
                              <Copy className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900" />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-center justify-center py-4">
                        <div className="bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm">
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${paymentDetails.pay_address}`}
                            alt="QR Code de Pagamento"
                            className="w-40 h-40"
                          />
                        </div>
                        <p className="text-[10px] text-zinc-400 mt-4 uppercase tracking-widest font-bold">QR CODE DE DEPÓSITO</p>
                      </div>

                      <div className="space-y-4">
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

                      <div className="space-y-6">
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            {CURRENCIES.map((curr) => (
                              <button
                                key={curr.id}
                                onClick={() => {
                                  setSelectedCurrency(curr.id as any);
                                  if (curr.id === 'btc' && amountUSD !== '10' && amountUSD !== '20') {
                                    setAmountUSD('');
                                  } else if (curr.id === 'usdtbsc' && (amountUSD === '10' || amountUSD === '20')) {
                                    setAmountUSD('');
                                  }
                                }}
                                className={`p-4 rounded-xl border-2 transition-all flex items-center justify-center gap-3 ${
                                  selectedCurrency === curr.id
                                  ? 'bg-zinc-50 border-zinc-900 text-zinc-900'
                                  : 'bg-white border-zinc-100 text-zinc-400 hover:bg-zinc-50'
                                }`}
                              >
                                <curr.icon className={`w-4 h-4 ${selectedCurrency === curr.id ? 'text-zinc-900' : 'text-zinc-300'}`} />
                                <span className="text-xs font-bold">{curr.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                            {[0.1, 0.5, 1, 5, 10, 20].filter(val => {
                              if (selectedCurrency === 'btc') {
                                return val === 10 || val === 20;
                              } else {
                                return val !== 10 && val !== 20;
                              }
                            }).map((val) => (
                              <button 
                                key={val}
                                onClick={() => setAmountUSD(val.toString())}
                                className={`py-5 rounded-xl text-sm font-bold transition-all flex flex-col items-center border-2 ${
                                  amountUSD === val.toString() 
                                  ? 'bg-zinc-50 border-zinc-900 text-zinc-900' 
                                  : 'bg-white border-zinc-100 text-zinc-400 hover:bg-zinc-50 hover:border-zinc-200'
                                }`}
                              >
                                <div className="flex items-center gap-1 opacity-70 mb-1">
                                  <span className="text-xs font-bold">{val * AC_RATE}</span>
                                  <AngoCoinIcon className="w-3 h-3" />
                                </div>
                                <span className="text-xl font-black leading-none">$ {val < 1 ? val.toFixed(2) : val}</span>
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
