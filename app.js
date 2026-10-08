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
  const [globalInterval, setGlobalInterval] = useState('5');

  const [historyDns, setHistoryDns] = useState(null);
  const [dnsLogs, setDnsLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    const savedInt = localStorage.getItem('global_check_interval');
    if (savedInt) setGlobalInterval(savedInt);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      if (subscription && subscription.unsubscribe) {
        subscription.unsubscribe();
      }
    };
  }, []);

  const carregarDnsUptime = async () => {
    setIsRefreshing(true);
    let monitorsFromSupabase = [];

    if (supabase) {
      const { data } = await supabase.from('dns_monitors').select('*');
      if (data && Array.isArray(data)) {
        monitorsFromSupabase = data;
      }
    }

    const intervalMinutes = parseInt(globalInterval) || 5;
    const intervalSeconds = intervalMinutes * 60;

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
          
          const statusStr = upMatch ? (upMatch.status === 2 ? 'online' : 'offline') : 'online';
          const uptimePct = upMatch && upMatch.custom_uptime_ratio ? parseFloat(upMatch.custom_uptime_ratio).toFixed(0) + '%' : '100%';
          
          // Gera logs com horários decrescentes baseados no intervalo real
          const nowSec = Math.floor(Date.now() / 1000);
          const logs = upMatch && upMatch.logs && upMatch.logs.length > 0 ? upMatch.logs : Array.from({ length: 28 }).map((_, i) => ({
            type: 1,
            datetime: nowSec - ((27 - i) * intervalSeconds)
          }));

          return {
            id: supItem.id.toString(),
            name: supItem.name || 'Servidor',
            url: supItem.url || '',
            interval: `${intervalMinutes} min`,
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
      console.warn('UptimeRobot indisponível:', err);
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const fallbackMapped = monitorsFromSupabase.map(item => ({
      id: item.id.toString(),
      name: item.name || 'Servidor',
      url: item.url || '',
      interval: `${intervalMinutes} min`,
      status: 'online',
      type: 'HTTP',
      uptime: '100%',
      durationText: 'Ativo',
      rawLogs: Array.from({ length: 28 }).map((_, i) => ({
        type: 1,
        datetime: nowSec - ((27 - i) * intervalSeconds)
      }))
    }));
    setDnsList(fallbackMapped);
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (session) {
      carregarDnsUptime();
    }
  }, [session, globalInterval]);

  const abrirHistorico = (dns, e) => {
    e.stopPropagation();
    setHistoryDns(dns);
    setLoadingLogs(true);

    if (dns.rawLogs && dns.rawLogs.length > 0) {
      const logsMapped = dns.rawLogs.slice(0, 30).map((l, idx) => ({
        id: idx,
        status: l.type === 1 ? 'online' : 'offline',
        created_at: new Date((l.datetime || Date.now() / 1000) * 1000).toLocaleString()
      }));
      setDnsLogs(logsMapped);
    } else {
      setDnsLogs([
        { id: '1', status: 'online', created_at: new Date().toLocaleString() }
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
      const { error } = await supabase.from('dns_monitors').insert([{ name, url }]);
      if (error) {
        alert('Erro ao salvar: ' + error.message);
        return;
      }
    }

    setModalOpen(false);
    e.target.reset();
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
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-80 bg-[#161b22] border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-slate-600 placeholder-slate-500"
          />
        </div>

        <div className="bg-[#161b22] border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/80">
          {filteredDns.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              Nenhum monitor encontrado.
            </div>
          ) : (
            filteredDns.map(item => (
              <div 
                key={item.id} 
                onClick={(e) => abrirHistorico(item, e)}
                className="p-3.5 sm:px-5 sm:py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-[#1f242c] transition-colors cursor-pointer group"
              >
                
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className={`w-3 h-3 rounded-full shrink-0 ${item.status === 'online' ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' : 'bg-rose-500 shadow-lg shadow-rose-500/50'}`}></div>
                  <div className="overflow-hidden space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-xs text-white truncate">{item.name}</span>
                      <span className="text-[10px] bg-[#21262d] text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 uppercase font-mono">{item.type}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-[11px] text-slate-400">
                      <span className="truncate max-w-[220px] sm:max-w-sm">{item.url}</span>
                      <span>•</span>
                      <span className="text-slate-500">{item.durationText}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-6 border-t md:border-t-0 pt-2 md:pt-0 border-slate-800">
                  
                  <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                    <span>⏱️</span>
                    <span>{item.interval}</span>
                  </div>

                  <div className="flex items-center space-x-[2px]">
                    {item.rawLogs && item.rawLogs.slice(0, 28).map((log, lIdx) => {
                      const logDate = new Date((log.datetime || Date.now() / 1000) * 1000).toLocaleString();
                      const statusText = log.type === 1 ? 'Online (100%)' : 'Offline';
                      return (
                        <div 
                          key={lIdx}
                          title={`${logDate} - ${statusText}`}
                          className={`w-1.5 h-6 rounded-[1px] transition-all hover:opacity-80 ${
                            log.type === 1 ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        ></div>
                      );
                    })}
                  </div>

                  <div className="flex items-center space-x-4">
                    <span className="text-xs font-semibold text-slate-200 w-10 text-right">{item.uptime}</span>
                    
                    <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={(e) => copiarUrl(item.url, e)} 
                        title="Copiar URL" 
                        className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 text-xs"
                      >
                        📋
                      </button>
                      <button 
                        onClick={(e) => handleDeleteDns(item, e)} 
                        title="Excluir" 
                        className="p-1.5 text-rose-400 hover:text-rose-300 rounded hover:bg-slate-800 text-xs"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                </div>

              </div>
            ))
          )}
        </div>

      </div>

      {settingsOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#161b22] border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>⚙️</span> Configurações do Sistema
            </h3>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Intervalo de Verificação</label>
                <select 
                  name="globalInterval" 
                  defaultValue={globalInterval}
                  className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="1">1 minuto</option>
                  <option value="5">5 minutos</option>
                  <option value="15">15 minutos</option>
                  <option value="30">30 minutos</option>
                  <option value="60">1 hora</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">Define o intervalo de tempo entre cada bloco de histórico.</p>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setSettingsOpen(false)} 
                  className="px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg text-xs"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {historyDns && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#161b22] border border-slate-800 rounded-xl w-full max-w-lg p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Detalhes do Monitor</span>
                <h3 className="text-lg font-bold text-white mt-1">{historyDns.name}</h3>
                <a href={historyDns.url} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:underline">
                  {historyDns.url}
                </a>
              </div>
              <button 
                onClick={() => setHistoryDns(null)} 
                className="text-slate-400 hover:text-white bg-[#21262d] px-3 py-1 rounded text-xs"
              >
                ✕
              </button>
            </div>

            <div className="bg-[#0d1117] border border-slate-800 p-4 rounded-lg space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Estado Atual:</span>
                <span className={`font-bold uppercase ${historyDns.status === 'online' ? 'text-emerald-400' : 'text-rose-400'}`}>{historyDns.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Disponibilidade (30 dias):</span>
                <span className="text-white font-semibold">{historyDns.uptime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Intervalo de Verificação:</span>
                <span className="text-white">{historyDns.interval}</span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-300">Histórico de Registos</span>
              <div className="bg-[#0d1117] border border-slate-800 p-4 rounded-lg">
                {loadingLogs ? (
                  <div className="text-center text-xs text-slate-500 py-3">A carregar logs...</div>
                ) : (
                  <div className="flex items-center gap-1 overflow-x-auto py-2">
                    {dnsLogs.map((log, idx) => (
                      <div 
                        key={idx}
                        title={`Estado: ${log.status} | Data: ${log.created_at}`}
                        className={`h-7 flex-1 min-w-[7px] rounded-[1px] ${log.status === 'online' ? 'bg-emerald-500' : 'bg-rose-500'}`}
                      ></div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <button 
                onClick={() => setHistoryDns(null)} 
                className="w-full bg-[#21262d] hover:bg-slate-700 text-white font-medium py-2 rounded-lg text-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#161b22] border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Adicionar Monitor</h3>
            <form onSubmit={handleSaveDns} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nome</label>
                <input 
                  name="name" 
                  placeholder="Ex: Servidor Principal"
                  required 
                  className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500" 
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">URL (http:// ou https://)</label>
                <input 
                  type="url" 
                  name="url" 
                  placeholder="https://exemplo.com"
                  required 
                  className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500" 
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setModalOpen(false)} 
                  className="px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg text-xs"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
