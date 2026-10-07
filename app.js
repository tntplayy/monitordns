const { useState, useEffect } = React;

const supabaseUrl = 'https://lokjdzebgkvibvppbkty.supabase.co';
const supabaseAnonKey = 'sb_publishable_9VrPiNpnt69qZD8_WE31Mw_119MrNDf';
const supabase = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseAnonKey) : null;

function App() {
  const [session, setSession] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loadingLogin, setLoadingLogin] = useState(false);

  const [dnsList, setDnsList] = useState([]);
  const [loadingDns, setLoadingDns] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingDns, setEditingDns] = useState(null);
  const [deleteModalId, setDeleteModalId] = useState(null);

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

  const carregarDns = async () => {
    if (!supabase) return;
    setLoadingDns(true);
    const { data, error } = await supabase
      .from('dns_monitors')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar DNS:', error);
      setDnsList([]);
    } else if (data && Array.isArray(data)) {
      const mapped = data.map(item => ({
        id: item.id,
        name: item.name || '',
        url: item.url || '',
        status: 'checking',
        latency: '-'
      }));
      setDnsList(mapped);
      mapped.forEach(item => testarStatusUrl(item.id, item.url));
    } else {
      setDnsList([]);
    }
    setLoadingDns(false);
  };

  useEffect(() => {
    if (session) {
      carregarDns();
    }
  }, [session]);

  useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  });

  const testarStatusUrl = async (id, url) => {
    const startTime = performance.now();
    try {
      await fetch(url, { mode: 'no-cors', cache: 'no-cache' });
      const endTime = performance.now();
      const latencyMs = Math.round(endTime - startTime) + 'ms';

      setDnsList(prev => (Array.isArray(prev) ? prev : []).map(item => item.id === id ? { ...item, status: 'online', latency: latencyMs } : item));
    } catch (err) {
      setDnsList(prev => (Array.isArray(prev) ? prev : []).map(item => item.id === id ? { ...item, status: 'offline', latency: '-' } : item));
    }
  };

  const testarTodasAsUrls = () => {
    if (!Array.isArray(dnsList)) return;
    dnsList.forEach(item => {
      setDnsList(prev => (Array.isArray(prev) ? prev : []).map(d => d.id === item.id ? { ...d, status: 'checking', latency: '-' } : d));
      testarStatusUrl(item.id, item.url);
    });
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

  const copiarUrl = (url) => {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      alert(`URL "${url}" copiada para a área de transferência!`);
    });
  };

  const handleSaveDns = async (e) => {
    e.preventDefault();
    if (!supabase) return;
    const formData = new FormData(e.target);
    const payload = {
      name: formData.get('name') || '',
      url: formData.get('url') || ''
    };

    if (editingDns) {
      const { error } = await supabase
        .from('dns_monitors')
        .update(payload)
        .eq('id', editingDns.id);

      if (error) {
        alert('Erro ao atualizar: ' + error.message);
      } else {
        await carregarDns();
      }
    } else {
      const { error } = await supabase
        .from('dns_monitors')
        .insert([payload]);

      if (error) {
        alert('Erro ao salvar: ' + error.message);
      } else {
        await carregarDns();
      }
    }

    setModalOpen(false);
    setEditingDns(null);
  };

  const handleDeleteDns = async (id) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('dns_monitors')
      .delete()
      .eq('id', id);

    if (error) {
      alert('Erro ao excluir: ' + error.message);
    } else {
      setDnsList(prev => (Array.isArray(prev) ? prev : []).filter(d => d.id !== id));
    }
    setDeleteModalId(null);
  };

  const safeDnsList = Array.isArray(dnsList) ? dnsList : [];
  const filteredDns = safeDnsList.filter(d => {
    const nameMatch = d && d.name ? d.name.toLowerCase().includes(searchTerm.toLowerCase()) : false;
    const urlMatch = d && d.url ? d.url.toLowerCase().includes(searchTerm.toLowerCase()) : false;
    return nameMatch || urlMatch;
  });

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090d16] p-4 font-sans">
        <div className="w-full max-w-md bg-[#0d1322] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <i data-lucide="globe" className="w-8 h-8"></i>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-wider">DNS <span className="text-emerald-500">MONITOR</span></h1>
            <p className="text-xs text-slate-400">Entre com sua conta para gerenciar os servidores</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">E-mail</label>
              <input
                type="email"
                placeholder="seuemail@exemplo.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full bg-[#111827] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 placeholder-slate-500"
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
                className="w-full bg-[#111827] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 placeholder-slate-500"
                required
              />
            </div>

            {loginError && <p className="text-xs text-rose-500 text-center font-semibold">{loginError}</p>}

            <button
              type="submit"
              disabled={loadingLogin}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-emerald-600/20 text-sm"
            >
              {loadingLogin ? 'Autenticando...' : 'Acessar Painel'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 font-sans p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#0d1322] border border-slate-800/60 p-5 rounded-2xl gap-4 shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20 text-emerald-400">
              <i data-lucide="globe" className="w-6 h-6"></i>
            </div>
            <div>
              <h1 className="font-bold text-lg text-white">DNS Monitor</h1>
              <p className="text-xs text-slate-400">{session.user.email}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            <button 
              onClick={testarTodasAsUrls} 
              title="Testar status novamente"
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all flex items-center space-x-1 text-xs font-medium"
            >
              <i data-lucide="refresh-cw" className={`w-4 h-4 ${loadingDns ? 'animate-spin' : ''}`}></i>
              <span className="hidden sm:inline">Verificar</span>
            </button>
            <button 
              onClick={handleLogout} 
              title="Sair"
              className="p-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl transition-all"
            >
              <i data-lucide="log-out" className="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
          <input
            type="text"
            placeholder="Buscar por nome ou URL..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-72 bg-[#0d1322] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 placeholder-slate-500"
          />
          <button
            onClick={() => { setEditingDns(null); setModalOpen(true); }}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl transition-all flex items-center justify-center space-x-2 text-sm shadow-lg shadow-emerald-600/20"
          >
            <i data-lucide="plus" className="w-4 h-4"></i>
            <span>Adicionar DNS</span>
          </button>
        </div>

        <div className="bg-[#0d1322] border border-slate-800/60 rounded-2xl overflow-hidden shadow-xl">
          <div className="divide-y divide-slate-800/40">
            {filteredDns.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                Nenhum DNS cadastrado.
              </div>
            ) : (
              filteredDns.map(item => (
                <div key={item.id} className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-slate-800/20 transition-colors">
                  
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className="p-2 rounded-xl bg-slate-800 shrink-0">
                      {item.status === 'online' && <i data-lucide="check-circle-2" className="w-5 h-5 text-emerald-400"></i>}
                      {item.status === 'offline' && <i data-lucide="x-circle" className="w-5 h-5 text-rose-500"></i>}
                      {item.status === 'checking' && <i data-lucide="loader-2" className="w-5 h-5 text-amber-400 animate-spin"></i>}
                    </div>
                    <div className="overflow-hidden">
                      <h3 className="font-semibold text-sm text-white truncate">{item.name}</h3>
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:underline truncate block">
                        {item.url}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-800/60">
                    <div className="text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        item.status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        item.status === 'offline' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                        'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {item.status}
                      </span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">Latência: {item.latency}</span>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button 
                        onClick={() => copiarUrl(item.url)} 
                        title="Copiar URL" 
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                      >
                        <i data-lucide="copy" className="w-4 h-4"></i>
                      </button>
                      <button 
                        onClick={() => { setEditingDns(item); setModalOpen(true); }} 
                        title="Editar" 
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                      >
                        <i data-lucide="edit-3" className="w-4 h-4"></i>
                      </button>
                      <button 
                        onClick={() => setDeleteModalId(item.id)} 
                        title="Excluir" 
                        className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-colors"
                      >
                        <i data-lucide="trash-2" className="w-4 h-4"></i>
                      </button>
                    </div>
                  </div>

                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0d1322] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">{editingDns ? 'Editar DNS' : 'Adicionar Novo DNS'}</h3>
            <form onSubmit={handleSaveDns} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nome / Apelido</label>
                <input 
                  name="name" 
                  defaultValue={editingDns ? editingDns.name : ''} 
                  placeholder="Ex: Servidor Principal 01"
                  required 
                  className="w-full bg-[#111827] border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" 
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">URL (http:// ou https://)</label>
                <input 
                  type="url" 
                  name="url" 
                  defaultValue={editingDns ? editingDns.url : ''} 
                  placeholder="https://exemplo.com"
                  required 
                  className="w-full bg-[#111827] border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" 
                />
              </div>
              <div className="flex justify-end space-x-2 pt-3">
                <button 
                  type="button" 
                  onClick={() => { setModalOpen(false); setEditingDns(null); }} 
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-xl text-xs shadow-lg shadow-emerald-600/20"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteModalId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0d1322] border border-slate-800 rounded-2xl w-full max-w-xs p-5 space-y-4 text-center shadow-2xl">
            <h3 className="text-base font-bold text-white">Deseja excluir este DNS?</h3>
            <div className="flex justify-center space-x-2 pt-1">
              <button 
                onClick={() => setDeleteModalId(null)} 
                className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button 
                onClick={() => handleDeleteDns(deleteModalId)} 
                className="bg-rose-600 hover:bg-rose-500 text-white font-medium px-3.5 py-1.5 rounded-xl text-xs shadow-lg shadow-rose-600/20"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
