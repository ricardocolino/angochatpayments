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
  TrendingUp
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
  const [amountUSD, setAmountUSD] = useState<string>('');
  const [isPaying, setIsPaying] = useState(false);

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
          currency: 'usd',
          orderId: `ac_${Date.now()}_${session.user.id}`,
          orderDescription: `Recarga de ${Number(amountUSD) * AC_RATE} AngoCoins para ${profile?.username}`,
        }),
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response:', text);
        throw new Error('O servidor retornou um erro inesperado (HTML). Verifique se as rotas da API estão configuradas corretamente na Vercel.');
      }

      const data = await response.json();

      if (data.invoice_url) {
        // Redirect user to NOWPayments checkout page
        window.location.href = data.invoice_url;
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
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-orange-500/30">
      {/* Header */}
      <header className="border-b border-zinc-900 bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">Angochat <span className="text-orange-500">Payments</span></span>
          </div>
          {session && (
            <button onClick={() => supabase.auth.signOut()} className="text-zinc-500 hover:text-zinc-100 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

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
                  <p className="text-zinc-400 text-sm mt-2">Gerencie seus AngoCoins (AC)</p>
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                  {isSignUp && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 ml-1">Username</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                          type="text"
                          required
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-orange-500/50 transition-colors"
                        />
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 ml-1">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-orange-500/50 transition-colors"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 ml-1">Senha</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-orange-500/50 transition-colors"
                      />
                    </div>
                  </div>

                  {error && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">{error}</div>}
                  {message && <div className="p-3 bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-lg">{message}</div>}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isSignUp ? 'Cadastrar' : 'Entrar na Conta')}
                  </button>
                </form>

                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="w-full mt-6 text-sm text-zinc-500 hover:text-orange-500 transition-colors"
                >
                  {isSignUp ? 'Já tem conta? Entre aqui' : 'Novo no Angochat? Crie sua conta'}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-8"
            >
              {/* Sidebar Info */}
              <div className="md:col-span-1 space-y-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center border border-zinc-700">
                      <User className="w-6 h-6 text-zinc-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{profile?.username || 'Usuário'}</h3>
                      <p className="text-zinc-500 text-xs truncate max-w-[150px]">{session.user.email}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                      <span className="text-xs text-zinc-500 font-medium">Status</span>
                      <span className="text-xs text-green-500 font-bold flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Verificado
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-orange-500/5 border border-orange-500/10 rounded-3xl p-6">
                  <h4 className="text-sm font-bold text-orange-500 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Taxa de Câmbio
                  </h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500">100 AC</span>
                      <span className="text-zinc-100 font-bold">$1.00 USD/USDT</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500">1 AC</span>
                      <span className="text-zinc-100 font-bold">$0.01 USD/USDT</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Payment Area */}
              <div className="md:col-span-2 space-y-8">
                {/* Balance Card */}
                <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-[2rem] p-8 text-white shadow-2xl shadow-orange-500/20 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
                    <Wallet className="w-32 h-32" />
                  </div>
                  <div className="relative z-10">
                    <p className="text-orange-100 text-sm font-medium mb-1">Saldo AngoCoins</p>
                    <h2 className="text-5xl font-black tracking-tighter mb-6">
                      {profile?.balance || '0'} <span className="text-2xl opacity-70">AC</span>
                    </h2>
                    <div className="flex gap-4">
                      <div className="px-4 py-2 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold border border-white/10">
                        ≈ ${(profile?.balance / 100).toFixed(2)} USD/USDT
                      </div>
                    </div>
                  </div>
                </div>

                {/* Top Up Section */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-8">
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <PlusCircle className="w-6 h-6 text-orange-500" /> Comprar AngoCoins
                  </h3>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Valor em USD / USDT</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-zinc-500">$</span>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={amountUSD}
                          onChange={(e) => setAmountUSD(e.target.value)}
                          className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-2xl py-5 pl-14 pr-6 text-3xl font-black focus:outline-none focus:border-orange-500 transition-all"
                        />
                        {amountUSD && !isNaN(Number(amountUSD)) && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-orange-500 font-bold text-lg">
                            = {Number(amountUSD) * AC_RATE} AC
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      {[1, 5, 10].map((val) => (
                        <button 
                          key={val}
                          onClick={() => setAmountUSD(val.toString())}
                          className="py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-bold transition-colors flex flex-col items-center"
                        >
                          <span>${val} USD/USDT</span>
                          <span className="text-[10px] text-zinc-500">{val * AC_RATE} AC</span>
                        </button>
                      ))}
                    </div>

                    {error && <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl">{error}</div>}
                    {message && <div className="p-4 bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-xl">{message}</div>}

                    <button
                      onClick={handleTopUp}
                      disabled={isPaying || !amountUSD}
                      className="w-full py-5 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-lg shadow-orange-500/20"
                    >
                      {isPaying ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                        <>
                          Confirmar Pagamento <ArrowRight className="w-6 h-6" />
                        </>
                      )}
                    </button>

                    <div className="mt-4 text-center">
                      <p className="text-[10px] text-zinc-500 flex items-center justify-center gap-1">
                        Pagamentos seguros via <span className="font-bold text-orange-500">NOWPayments</span>
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-6 pt-4 opacity-30 grayscale">
                      <div className="font-bold italic text-xl">USDT</div>
                      <div className="font-bold text-xl">VISA</div>
                      <div className="font-bold text-xl">MASTERCARD</div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-5xl mx-auto px-6 py-12 border-t border-zinc-900 text-center">
        <p className="text-zinc-600 text-xs">
          © 2026 Angochat Payments. Todos os direitos reservados. 
          <br />
          Processamento seguro via SSL 256-bit.
        </p>
      </footer>
    </div>
  );
}
