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
  ArrowRight,
  ShieldCheck,
  History,
  TrendingUp,
  Bitcoin,
  Globe,
  Smartphone,
  Building2
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
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [amountUSD, setAmountUSD] = useState<string>('');
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [isPaying, setIsPaying] = useState(false);
  const [airtmStep, setAirtmStep] = useState<1 | 2>(1);

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

      if (data.invoice_url) {
        // Request parent window to open the NOWPayments checkout page
        window.parent.postMessage({ type: 'OPEN_URL', url: data.invoice_url }, '*');
      } else {
        throw new Error(data.error || 'Erro ao gerar fatura de pagamento');
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Erro ao processar pagamento via NOWPayments');
      setIsPaying(false);
    }
  };

  if (loading && !session) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-red-500/30">
      <main className="max-w-5xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {!session ? (
            <motion.div
              key="auth"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto"
            >
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold">{isSignUp ? 'Criar Conta' : 'Acesse sua Carteira'}</h2>
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                  {isSignUp && (
                    <div className="space-y-1.5">
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                          type="text"
                          placeholder="Username"
                          required
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-red-500/50 transition-colors"
                        />
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input
                        type="email"
                        placeholder="Email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-red-500/50 transition-colors"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input
                        type="password"
                        placeholder="Senha"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-red-500/50 transition-colors"
                      />
                    </div>
                  </div>

                  {error && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">{error}</div>}
                  {message && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">{message}</div>}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isSignUp ? 'Cadastrar' : 'Entrar na Conta')}
                  </button>
                </form>

                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="w-full mt-6 text-sm text-zinc-500 hover:text-red-500 transition-colors"
                >
                  {isSignUp ? 'Já tem conta? Entre aqui' : 'Novo no Angochat? Crie sua conta'}
                </button>
              </div>
            </motion.div>
          ) : !selectedMethod ? (
            <motion.div
              key="method-select"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto px-4"
            >
              <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500/20 to-transparent" />
                
                <div className="flex flex-col items-center mb-8">
                  <div className="w-10 h-1 bg-zinc-800 rounded-full mb-6 opacity-50" />
                  <h2 className="text-lg font-black text-zinc-400 tracking-widest uppercase italic">Pagamento</h2>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'bitcoin', name: 'Bitcoin', icon: Bitcoin, available: true },
                    { id: 'airtm', name: 'Airtm', icon: Globe, available: true, isManual: true },
                    { id: 'multicaixa', name: 'Express', icon: Smartphone, available: false },
                    { id: 'banco', name: 'Banco', icon: Building2, available: false },
                  ].map((method) => (
                    <button
                      key={method.id}
                      onClick={() => method.available && setSelectedMethod(method.id)}
                      disabled={!method.available}
                      className={`group relative border rounded-3xl p-5 flex flex-col items-center justify-center gap-3 transition-all shadow-lg ${
                        method.available 
                        ? 'bg-zinc-950 border-zinc-800 hover:border-red-500/50 active:scale-95' 
                        : 'bg-zinc-900/50 border-zinc-900 cursor-not-allowed grayscale opacity-60'
                      }`}
                    >
                      {!method.available && (
                        <div className="absolute top-2 right-2">
                          <div className="w-1.5 h-1.5 bg-zinc-700 rounded-full animate-pulse" />
                        </div>
                      )}
                      
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                        method.available ? 'bg-red-500/5 group-hover:bg-red-500/10' : 'bg-zinc-800/20'
                      }`}>
                        <method.icon className={`w-6 h-6 ${method.available ? 'text-red-500' : 'text-zinc-700'}`} />
                      </div>
                      
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-xs font-bold uppercase tracking-wider transition-colors ${
                          method.available ? 'text-zinc-500 group-hover:text-zinc-100' : 'text-zinc-700'
                        }`}>
                          {method.name}
                        </span>
                        {method.available && method.isManual && (
                          <span className="text-[8px] font-black text-red-500 uppercase tracking-tighter">Manual</span>
                        )}
                        {!method.available && (
                          <span className="text-[8px] font-black text-zinc-800 uppercase tracking-tighter">Em breve</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                <p className="mt-8 text-[10px] text-zinc-600 font-bold text-center uppercase tracking-[0.2em]">Selecione um método acima</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <button 
                onClick={() => {
                  if (selectedMethod === 'airtm' && airtmStep === 2) {
                    setAirtmStep(1);
                  } else {
                    setSelectedMethod(null);
                    setAmountUSD('');
                    setAirtmStep(1);
                  }
                }}
                className="text-xs text-zinc-500 hover:text-red-500 flex items-center gap-1 transition-colors"
              >
                ← {selectedMethod === 'airtm' && airtmStep === 2 ? 'Mudar valor' : 'Voltar para métodos'}
              </button>
              {/* Main Payment Area */}
              <div className="space-y-8">
                {/* Top Up Section */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-8">
                  <h3 className="text-xl font-bold mb-6">
                    {profile?.username}
                  </h3>

                  <div className="space-y-6">
                    {selectedMethod === 'airtm' ? (
                      <div className="space-y-6">
                        {airtmStep === 1 ? (
                          <div className="space-y-6">
                            <div className="flex flex-col items-center mb-4">
                              <span className="text-[10px] font-black text-red-500 uppercase tracking-widest bg-red-500/5 px-3 py-1 rounded-full border border-red-500/10 mb-2">Passo 01/02</span>
                              <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-tight">Quanto deseja carregar?</h4>
                            </div>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {[0.2, 0.5, 1, 5, 10].map((val) => (
                                <button 
                                  key={val}
                                  onClick={() => setAmountUSD(val.toString())}
                                  className={`py-4 rounded-xl text-sm font-bold transition-all flex flex-col items-center border-2 ${
                                    amountUSD === val.toString() 
                                    ? 'bg-red-500/20 border-red-500 text-red-500 shadow-lg shadow-red-500/10 scale-[1.02]' 
                                    : 'bg-zinc-800/50 border-zinc-800 text-zinc-500 hover:bg-zinc-800 hover:border-zinc-700'
                                  }`}
                                >
                                  <span className="text-lg tracking-tighter truncate">$ {val}</span>
                                  <span className="text-[10px] opacity-40 italic">{(val * AC_RATE).toLocaleString()} AC</span>
                                </button>
                              ))}
                            </div>

                            {amountUSD && (
                              <button
                                onClick={() => setAirtmStep(2)}
                                className="w-full py-5 bg-zinc-100 text-zinc-950 hover:bg-white rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 shadow-xl"
                              >
                                Próximo Passo <ArrowRight className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <div className="flex flex-col items-center mb-4">
                              <span className="text-[10px] font-black text-red-500 uppercase tracking-widest bg-red-500/5 px-3 py-1 rounded-full border border-red-500/10 mb-2">Passo 02/02</span>
                              <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-tight">Instruções de Envio</h4>
                            </div>

                            <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 space-y-4">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em]">Envia para @Airtm</span>
                                <div className="flex items-center gap-1">
                                  <span className="w-1 h-1 bg-red-400 rounded-full animate-pulse" />
                                  <span className="text-[8px] text-red-500 font-black uppercase tracking-widest">Saldo: ${amountUSD}</span>
                                </div>
                              </div>
                              
                              <div className="p-4 bg-zinc-900 rounded-2xl border border-zinc-800 flex items-center justify-between group">
                                <span className="text-zinc-100 font-black tracking-tight text-base">angochat</span>
                                <button 
                                  onClick={() => {
                                    navigator.clipboard.writeText('angochat');
                                    setMessage('Copiado!');
                                    setTimeout(() => setMessage(null), 2000);
                                  }}
                                  className="px-4 py-2 bg-red-500/10 text-red-500 text-[10px] font-black rounded-xl hover:bg-red-500 hover:text-white transition-all uppercase tracking-widest"
                                >
                                  Copiar
                                </button>
                              </div>

                              <div className="space-y-2">
                                <p className="text-[10px] text-zinc-500 font-bold leading-relaxed uppercase tracking-tighter">
                                  1. Abra sua conta Airtm<br />
                                  2. Selecione "Enviar" e use o usuário <span className="text-red-500">angochat</span><br />
                                  3. Envie exatamente <span className="text-red-500">${amountUSD}</span><br />
                                  4. Cole o ID da transação abaixo:
                                </p>
                              </div>
                            </div>

                            <div className="relative group">
                              <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600 group-focus-within:text-red-500 transition-colors" />
                              <input
                                type="text"
                                placeholder="ID da Transação"
                                value={transactionRef}
                                onChange={(e) => setTransactionRef(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl py-5 pl-12 pr-6 focus:outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all text-sm font-bold"
                              />
                            </div>

                            {error && <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase rounded-xl tracking-wider">{error}</div>}
                            {message && <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase rounded-xl tracking-wider text-center">{message}</div>}

                            <button
                              onClick={async () => {
                                if (!amountUSD || !transactionRef) {
                                  setError('Preencha as informações solicitadas.');
                                  return;
                                }
                                setIsPaying(true);
                                setError(null);
                                
                                try {
                                  const { error: insertError } = await supabase
                                    .from('transactions')
                                    .insert([{
                                      user_id: session.user.id,
                                      amount: Number(amountUSD),
                                      method: 'airtm',
                                      transaction_ref: transactionRef,
                                      status: 'pending'
                                    }]);

                                  if (insertError) throw insertError;

                                  setMessage('ENVIADO! Aguarde a verificação administrativa.');
                                  setTransactionRef('');
                                  setAmountUSD('');
                                  setTimeout(() => {
                                    setAirtmStep(1);
                                    setSelectedMethod(null);
                                    setMessage(null);
                                  }, 3000);
                                } catch (err: any) {
                                  console.error('Error saving transaction:', err);
                                  setError('Erro de conexão. Tente novamente.');
                                } finally {
                                  setIsPaying(false);
                                }
                              }}
                              disabled={isPaying || !amountUSD || !transactionRef}
                              className="w-full py-6 bg-red-500 hover:bg-red-600 text-white rounded-[2rem] font-black text-lg transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-2xl shadow-red-500/40 uppercase tracking-widest italic"
                            >
                              {isPaying ? <Loader2 className="w-7 h-7 animate-spin" /> : 'Confirmar Envio'}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="grid grid-cols-3 gap-4">
                          {[1, 5, 10].map((val) => (
                            <button 
                              key={val}
                              onClick={() => setAmountUSD(val.toString())}
                              className={`py-4 rounded-xl text-sm font-bold transition-all flex flex-col items-center border-2 ${
                                amountUSD === val.toString() 
                                ? 'bg-red-500/20 border-red-500 text-red-500 shadow-lg shadow-red-500/10' 
                                : 'bg-zinc-800 border-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:border-zinc-700'
                              }`}
                            >
                              <span className="text-lg">$ {val}</span>
                              <span className="text-[10px] opacity-60">{val * AC_RATE} AC</span>
                            </button>
                          ))}
                        </div>

                        {amountUSD && (
                          <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-xl text-center">
                            <p className="text-sm text-zinc-400">Você receberá</p>
                            <p className="text-2xl font-black text-red-500">{Number(amountUSD) * AC_RATE} AngoCoins</p>
                          </div>
                        )}

                        {error && <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl">{error}</div>}
                        {message && <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl">{message}</div>}

                        <button
                          onClick={handleTopUp}
                          disabled={isPaying || !amountUSD}
                          className="w-full py-5 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-lg shadow-red-500/20"
                        >
                          {isPaying ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Confirmar Pagamento'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
