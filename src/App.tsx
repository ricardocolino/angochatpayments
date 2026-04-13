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
        <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-green-500/30">
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
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-green-500/50 transition-colors"
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
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-green-500/50 transition-colors"
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
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-green-500/50 transition-colors"
                      />
                    </div>
                  </div>

                  {error && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">{error}</div>}
                  {message && <div className="p-3 bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-lg">{message}</div>}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-500/20"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isSignUp ? 'Cadastrar' : 'Entrar na Conta')}
                  </button>
                </form>

                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="w-full mt-6 text-sm text-zinc-500 hover:text-green-500 transition-colors"
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
              className="max-w-2xl mx-auto space-y-8"
            >
              {/* Main Payment Area */}
              <div className="space-y-8">
                {/* Top Up Section */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-8">
                  <h3 className="text-xl font-bold mb-6">
                    {profile?.username}
                  </h3>

                  <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                      {[1, 5, 10].map((val) => (
                        <button 
                          key={val}
                          onClick={() => setAmountUSD(val.toString())}
                          className={`py-4 rounded-xl text-sm font-bold transition-all flex flex-col items-center border-2 ${
                            amountUSD === val.toString() 
                            ? 'bg-green-500/20 border-green-500 text-green-500 shadow-lg shadow-green-500/10' 
                            : 'bg-zinc-800 border-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:border-zinc-700'
                          }`}
                        >
                          <span className="text-lg">$ {val}</span>
                          <span className="text-[10px] opacity-60">{val * AC_RATE} AC</span>
                        </button>
                      ))}
                    </div>

                    {amountUSD && (
                      <div className="p-4 bg-green-500/5 border border-green-500/10 rounded-xl text-center">
                        <p className="text-sm text-zinc-400">Você receberá</p>
                        <p className="text-2xl font-black text-green-500">{Number(amountUSD) * AC_RATE} AngoCoins</p>
                      </div>
                    )}

                    {error && <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl">{error}</div>}
                    {message && <div className="p-4 bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-xl">{message}</div>}

                    <button
                      onClick={handleTopUp}
                      disabled={isPaying || !amountUSD}
                      className="w-full py-5 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-lg shadow-green-500/20"
                    >
                      {isPaying ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Confirmar Pagamento'}
                    </button>
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
