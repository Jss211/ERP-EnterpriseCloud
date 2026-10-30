import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Menu, Bell, Sun, Moon, LogIn, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { erpModules } from '../config/modules';
import { useSidebarResize } from './useSidebarResize';

export const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  useEffect(() => {
    setMobileOpen(false);
    const module = erpModules.find(item => location.pathname === `/${item.id}` || [...item.links, ...(item.secondaryLinks ?? [])].some(link => link.path && link.path !== '/' && location.pathname === link.path.split('?')[0]));
    if (module) setExpanded(prev => prev.includes(module.id) ? prev : [...prev, module.id]);
  }, [location.pathname, location.search]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebar = useSidebarResize();
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('erp_theme') === 'dark'; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try { localStorage.setItem('erp_theme', darkMode ? 'dark' : 'light'); } catch { /* Theme remains available for this session. */ }
  }, [darkMode]);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    navigate('/login');
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);

  };

  return (
    <div className={`flex h-screen overflow-hidden ${darkMode ? 'dark bg-slate-900' : 'bg-slate-50'}`}>
      
      {/* Sidebar Overlay (Mobile) */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-20 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        style={{ '--sidebar-width': `${sidebarOpen ? sidebar.width : 80}px`, '--sidebar-mobile-width': `${sidebarOpen ? 288 : 80}px` } as React.CSSProperties}
        id="erp-navigation" aria-label="Navegación principal"
        className={`fixed md:relative ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} z-30 h-full flex shrink-0 flex-col w-[var(--sidebar-mobile-width)] max-w-[calc(100vw-3rem)] md:w-[var(--sidebar-width)] md:max-w-none ${sidebar.resizing ? 'transition-none' : 'transition-[width,background-color,border-color] duration-200'} print:hidden ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        } border-r shadow-xl md:shadow-none`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-inherit">
          {sidebarOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-700 shadow-sm text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
                </svg>
              </div>
              <div className="flex flex-col">
                <span className={`font-bold text-lg tracking-tight leading-none ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  ERP <span className="text-blue-600">SENATINO</span>
                </span>
                <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Sistema de Gestión</span>
              </div>
            </motion.div>
          )}
          {!sidebarOpen && (
            <div className="mx-auto flex items-center justify-center w-9 h-9 rounded-lg bg-blue-700 shadow-sm text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
              </svg>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-2 custom-scrollbar" aria-label="Módulos ERP">
          <NavLink to="/" end onClick={() => setMobileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-blue-600 dark:text-blue-300" title="Dashboard"><LayoutDashboard size={20} />{sidebarOpen && 'Dashboard'}</NavLink>
          {erpModules.map((module, index) => {
            const active = location.pathname === `/${module.id}` || [...module.links, ...(module.secondaryLinks ?? [])].some(link => link.path && link.path !== '/' && location.pathname === link.path.split('?')[0]);
            const open = expanded.includes(module.id);
            return <div key={module.id}>
              <button type="button" title={module.name} aria-expanded={open} aria-controls={`nav-${module.id}`}
                onClick={() => { if (!sidebarOpen) setSidebarOpen(true); setExpanded(prev => prev.includes(module.id) ? prev.filter(id => id !== module.id) : [...prev, module.id]); }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${active ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                <span className="shrink-0 text-xs font-bold">{String(index + 1).padStart(2, '0')}</span>
                {sidebarOpen && <><span className="flex-1">{module.name}</span><span aria-hidden="true">{open ? '−' : '+'}</span></>}
              </button>
              {open && sidebarOpen && <div id={`nav-${module.id}`} className="ml-5 space-y-1 border-l border-slate-200 pl-3 dark:border-slate-700">
                {module.links.map(link => link.path ? <NavLink key={link.name} to={link.path} title={link.description} end onClick={() => setMobileOpen(false)} className={({ isActive }) => `block rounded-lg px-3 py-2 text-xs ${isActive ? 'font-semibold text-blue-700 dark:text-blue-300' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>{link.name}</NavLink> : <button key={link.name} type="button" disabled title={link.description} className="block w-full cursor-not-allowed rounded-lg px-3 py-2 text-left text-xs text-slate-400 dark:text-slate-500">{link.name}<span className="ml-1 text-[10px]">· Próximamente</span></button>)}
                <NavLink to={`/${module.id}`} end onClick={() => setMobileOpen(false)} className={({ isActive }) => `block rounded-lg px-3 py-2 text-xs ${isActive ? 'font-semibold text-blue-700 dark:text-blue-300' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>Resumen del módulo</NavLink>
              </div>}
            </div>;
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-inherit">
           <button 
             aria-label="Contraer o expandir menú" aria-expanded={sidebarOpen} onClick={() => { sidebar.stopResize(); setSidebarOpen(!sidebarOpen); }}
             className={`w-full flex items-center justify-center p-2.5 rounded-xl transition-colors ${
               darkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
             }`}
           >
             <Menu size={20} />
           </button>
        </div>
        {sidebarOpen && <div
          role="separator" aria-orientation="vertical" aria-label="Ancho del menú lateral"
          aria-controls="erp-navigation" aria-valuemin={sidebar.minWidth} aria-valuemax={sidebar.maxWidth}
          aria-valuenow={sidebar.width} aria-valuetext={`${sidebar.width} píxeles`}
          title="Arrastra para ajustar el ancho. Flechas: 10 px; Mayús + flechas: 40 px; Inicio/Fin: límites."
          tabIndex={0} {...sidebar.separatorEvents}
          className={`absolute inset-y-0 -right-1 z-40 hidden w-2 touch-none cursor-col-resize md:block focus-visible:outline-2 focus-visible:outline-blue-500 ${sidebar.resizing ? 'bg-blue-500/40 dark:bg-blue-400/40' : 'hover:bg-blue-500/25 dark:hover:bg-blue-400/30'}`}
        />}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 print:block print:h-auto print:overflow-visible">
        
        {/* Header */}
        <header className={`h-16 flex items-center justify-between px-6 border-b transition-colors duration-300 print:hidden ${
          darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          <div className="flex items-center gap-4">
            <button aria-label="Abrir menú" aria-expanded={mobileOpen} aria-controls="erp-navigation" onClick={() => { setSidebarOpen(true); setMobileOpen(!mobileOpen); }} className="md:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              <Menu size={20} />
            </button>
            <div className="hidden sm:block">
              <h2 className="text-sm font-semibold opacity-70">ERP SENATINO</h2>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button aria-label="Cambiar modo oscuro" aria-pressed={darkMode} onClick={toggleDarkMode} className={`p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-slate-800 bg-slate-800' : 'hover:bg-slate-100 bg-slate-50'}`}>
              {darkMode ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-slate-600" />}
            </button>
            <button aria-label="Ver disponibilidad de notificaciones" onClick={() => navigate('/notificaciones')} className={`p-2 rounded-full relative transition-colors ${darkMode ? 'hover:bg-slate-800 bg-slate-800' : 'hover:bg-slate-100 bg-slate-50'}`}>
              <Bell size={18} />

            </button>
            
            {currentUser ? (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                <div 
                  className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-sm border-2 border-white dark:border-slate-800"
                  title={currentUser.email}
                >
                  {currentUser.email ? currentUser.email.substring(0, 2).toUpperCase() : 'US'}
                </div>
                <button
                  onClick={handleSignOut}
                  title="Cerrar sesión"
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <LogOut size={17} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                <LogIn size={15} />
                <span>Ingresar</span>
              </button>
            )}
          </div>
        </header>

        {/* Content */}
        <div className={`flex-1 overflow-auto p-4 md:p-6 lg:p-8 print:p-0 print:overflow-visible print:bg-white ${darkMode ? 'bg-slate-950' : 'bg-slate-50/50'}`}>
          <Outlet context={{ darkMode }} />
        </div>
      </main>

    </div>
  );
};
