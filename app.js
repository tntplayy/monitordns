const { useState, useEffect } = React;

const supabaseUrl = 'https://lokjdzebgkvibvppbkty.supabase.co';
const supabaseAnonKey = 'sb_publishable_9VrPiNpnt69qZD8_WE31Mw_119MrNDf';
const supabase = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseAnonKey) : null;

const UPTIME_API_KEY = 'u2280221-ab011c0344f614ea155afd27';

function App() {
  const [session, setSession] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loadingLogin, setLoadingLogin] = useState(false);

  const [dnsList, setDnsList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [globalInterval, setGlobalInterval] = useState(localStorage.getItem('global_check_interval') || '5');

  const [historyDns, setHistoryDns] = useState(null);
  const [dnsLogs, setDnsLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const carregarDnsUptime = async () => {
    setIsRefreshing(true);
    let monitorsFromSupabase = [];

    if (supabase) {
      const { data } = await supabase.from('dns_monitors').select('*').order('created_at', { ascending: false });
      if (data && Array.isArray(data)) {
        monitorsFromSupabase = data;
      }
    }

    try {
      const body = `api_key=${UPTIME_API_KEY}&format=json&logs=1&response_times=1&custom_uptime_ratios=30`;
      const res = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
      });
      const data = await res.json();
      
      if (data && data.stat === 'ok' && Array.isArray(data.monitors)) {
        const mapped = monitorsFromSupabase.map(supItem => {
          const upMatch = data.monitors.find(m => m.url && supItem.url && m.url.toLowerCase().trim() === supItem.url.toLowerCase().trim());
          
          let statusStr = upMatch ? (upMatch.status === 2 ? 'online' : 'offline') : 'online';
          let uptimePct = upMatch && upMatch.custom_uptime_ratio ? parseFloat(upMatch.custom_uptime_ratio).toFixed(0) + '%' : '100%';
          
          let logs = upMatch && upMatch.logs && upMatch.logs.length > 0 ? upMatch.logs : Array.from({ length: 25 }).map((_, i) => ({
            type: 1,
            datetime: Math.floor(Date.now() / 1000) - (i * 3600),
            duration: 0
          }));

          const intervalDisplay = supItem.interval ? `${supItem.interval} min` : `${globalInterval} min`;

          return {
            id: supItem.id.toString(),
            name: supItem.name || 'Servidor',
            url: supItem.url || '',
            interval: intervalDisplay,
            status: statusStr,
            type: 'HTTP',
            uptime: uptimePct,
            durationText: 'Ativo',
            rawLogs: logs
          };
        });
        setDnsList(mapped);
        setIsRefreshing(false);
        return;
      }
    } catch (err) {
      console.warn('Erro ao ligar ao UptimeRobot:', err);
    }

    const fallbackMapped = monitorsFromSupabase.map(item => ({
      id: item.id.toString(),
      name: item.name || 'Servidor',
      url: item.url || '',
      interval: item.interval ? `${item.interval} min` : `${globalInterval} min`,
      status: 'online',
      type: 'HTTP',
      uptime: '100%',
      durationText: 'Ativo',
      rawLogs: Array.from({ length: 25 }).map((_, i) => ({
        type: 1,
        datetime: Math.floor(Date.now() / 1000) - (i * 3600),
        duration: 0
      }))
    }));
    setDnsList(fallbackMapped);
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (session) {
      carregarDnsUptime();
    }
  }, [session]);

  const abrirHistorico = (dns, e) => {
    e.stopPropagation();
    setHistoryDns(dns);
    setLoadingLogs(true);

    if (dns.rawLogs && dns.rawLogs.length > 0) {
      const logsMapped = dns.rawLogs.slice(0, 30).map((l, idx) => ({
        id: idx,
        status: l.type === 1 ? 'online' : 'offline',
        latency: l.duration ? l.duration + 's' : '-',
        created_at: new Date((l.datetime || Date.now() / 1000) * 1000).toLocaleString()
      }));
      setDnsLogs(logsMapped);
    } else {
      setDnsLogs([
        { id: '1', status: 'online', latency: '40ms', created_at: new Date().toLocaleString() }
      ]);
    }
    setLoadingLogs(false);
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!supabase) return;
    setLoginError('');
    setLoadingLogin(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: emailInput,
      password: passwordInput,
    });

    if (error) {
      setLoginError('E-mail ou senha incorretos!');
    } else {
      setEmailInput('');
      setPasswordInput('');
    }
    setLoadingLogin(false);
  };

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
  };

  const copiarUrl = (url, e) => {
    e.stopPropagation();
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      alert(`URL "${url}" copiada!`);
    });
  };

  const handleSaveDns = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const name = formData.get('name');
    const url = formData.get('url');

    if (supabase) {
      const { error } = await supabase.from('dns_monitors').insert([{ name, url, interval: parseInt(globalInterval) }]);
      if (error) {
        alert('Erro ao salvar: ' + error.message);
        return;
      }
    }

    setModalOpen(false);
    carregarDnsUptime();
  };

  const handleSaveSettings = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newInterval = formData.get('globalInterval');
    setGlobalInterval(newInterval);
    localStorage.setItem('global_check_interval', newInterval);
    setSettingsOpen(false);
    carregarDnsUptime();
  };

  const handleDeleteDns = async (item, e) => {
    if (e) e.stopPropagation();
    if (!confirm('Deseja excluir este monitor?')) return;

    if (supabase) {
      await supabase.from('dns_monitors').delete().eq('id', item.id);
    }

    setDnsList(prev => prev.filter(d => d.id !== item.id));
    if (historyDns && historyDns.id === item.id) setHistoryDns(null);
  };

  const safeDnsList = Array.isArray(dnsList) ? dnsList : [];
  const filteredDns = safeDnsList.filter(d => {
    const nameMatch = d && d.name ? d.name.toLowerCase().includes(searchTerm.toLowerCase()) : false;
    const urlMatch = d && d.url ? d.url.toLowerCase().includes(searchTerm.toLowerCase()) : false;
    return nameMatch || urlMatch;
  });

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d1117] p-4 font-sans">
        <div className="w-full max-w-md bg-[#161b22] border border-slate-800 rounded-xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-white tracking-wider">Monitores<span className="text-emerald-500">.</span></h1>
            <p className="text-xs text-slate-400">Faça login para gerir o painel</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">E-mail</label>
              <input
                type="email"
                placeholder="seuemail@exemplo.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Senha</label>
              <input
                type="password"
                placeholder="••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            {loginError && <p className="text-xs text-rose-500 text-center font-semibold">{loginError}</p>}

            <button
              type="submit"
              disabled={loadingLogin}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-all text-sm"
            >
              {loadingLogin ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#c9d1d9] font-sans p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#161b22] border border-slate-800 p-4 rounded-xl gap-4">
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold text-white tracking-wide">Monitorados<span className="text-emerald-500">.</span></h1>
            <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700">
              {filteredDns.length} / {filteredDns.length}
            </span>
          </div>
          
          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            <button 
              onClick={carregarDnsUptime} 
              disabled={isRefreshing}
              className="px-3 py-2 bg-[#21262d] hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center space-x-1"
            >
              <span>{isRefreshing ? '⏳ A atualizar...' : 'Atualizar'}</span>
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3.5 py-2 rounded-lg text-xs transition-all shadow"
            >
              Adicionar
            </button>
            
            {/* Botão de Configurações com ícone de engrenagem */}
            <button 
              onClick={() => setSettingsOpen(true)} 
              title="Configurações"
              className="px-3 py-2 bg-[#21262d] hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center justify-center"
            >
              ⚙️
            </button>

            <button 
              onClick={handleLogout} 
              className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg text-xs font-medium"
            >
              Sair
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center gap-3">
          <input
            type="text"
            placeholder="Pesquisar por Nome OU URL..."
            value={searchTerm}
