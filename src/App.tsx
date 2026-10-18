import React, { useEffect, useState } from 'react';
import { FileUploader } from './components/FileUploader';
import { SheetsImporter } from './components/SheetsImporter';
import { BoatSelector } from './components/BoatSelector';
import { CabinList } from './components/CabinList';
import { InquiryPanel } from './components/InquiryPanel';
import { TabSwitcher } from './components/TabSwitcher';
import { TemplateGenerator } from './components/TemplateGenerator';
import { OutputPreview } from './components/OutputPreview';
import { MediaGallery } from './components/MediaGallery';
import { LivePreviewPanel } from './components/LivePreviewPanel';
import { Notepad } from './components/Notepad';
import { ThemeToggle } from './components/ThemeToggle';
import { AppGuide } from './components/AppGuide';
import { AppConfigurator } from './components/AppConfigurator';
import { SpotlightSearch } from './components/SpotlightSearch';
import { CustomerSharePage } from './components/CustomerSharePage';
import { ShareLinkModal } from './components/ShareLinkModal';
import { ShareLinksManager } from './components/ShareLinksManager';
import { WhatsAppConfigModal } from './components/WhatsAppConfigModal';
import { syncLocalLinksToCloud } from './lib/shareService';
import { useStore } from './store';
import { cn, matchShortcut } from './lib/utils';
import { Ship, Info, LogIn, LogOut, Check, AlertCircle, FileSpreadsheet, Image as ImageIcon, Loader2, HelpCircle, Link2, MessageCircle, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { googleSignIn, initAuth, logout, getWhitelistedEmails } from './lib/firebase';
import { User } from 'firebase/auth';

export default function App() {
  const { 
    boats, 
    tabs, 
    activeTabId, 
    theme, 
    googleUser, 
    googleToken, 
    setGoogleUser, 
    setKicFiles, 
    setLebaliblogFiles,
    livePreviewEnabled,
    customWidth,
    setCustomWidth,
    customShortcuts,
    setLanguage,
    setSelectedCabinIds,
    clearNotes,
    toggleShowNotepad,
    toggleShowMediaGallery,
    toggleShowBoatCabinSelector,
    toggleShowInquiryPanel
  } = useStore();
  const [importMode, setImportMode] = useState<'FILE' | 'SHEETS'>('FILE');
  const activeTab = (tabs.find(t => t.id === activeTabId) || tabs[0] || {}) as any;
  const selectedBoatName = activeTab.selectedBoatName || null;
  const selectedCabinIds = activeTab.selectedCabinIds || [];

  const {
    showMediaGallery = true,
    showBoatCabinSelector = true,
    showInquiryPanel = true,
    showNotepad = true,
  } = activeTab;

  // Google Login popup and check states/tokens are in the global useStore now
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [isConfiguratorOpen, setIsConfiguratorOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareModalSource, setShareModalSource] = useState<'notepad' | 'editor'>('notepad');
  const [isShareManagerOpen, setIsShareManagerOpen] = useState(false);
  const [isWhatsAppConfigOpen, setIsWhatsAppConfigOpen] = useState(false);

  const [currentShareId, setCurrentShareId] = useState<string | null>(() => {
    const path = window.location.pathname;
    const match = path.match(/\/share\/([a-zA-Z0-9_\-]+)/i);
    if (match) return match[1].trim();
    const hash = window.location.hash;
    const hashMatch = hash.match(/#\/?share\/([a-zA-Z0-9_\-]+)/i);
    if (hashMatch) return hashMatch[1].trim();
    const params = new URLSearchParams(window.location.search);
    const p = params.get('share') || params.get('id') || params.get('s');
    return p ? p.trim() : null;
  });

  useEffect(() => {
    const handleLocation = () => {
      const path = window.location.pathname;
      const match = path.match(/\/share\/([a-zA-Z0-9_\-]+)/i);
      if (match) {
        setCurrentShareId(match[1].trim());
        return;
      }
      const hash = window.location.hash;
      const hashMatch = hash.match(/#\/?share\/([a-zA-Z0-9_\-]+)/i);
      if (hashMatch) {
        setCurrentShareId(hashMatch[1].trim());
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const p = params.get('share') || params.get('id') || params.get('s');
      if (p) {
        setCurrentShareId(p.trim());
        return;
      }
      setCurrentShareId(null);
    };

    window.addEventListener('popstate', handleLocation);
    window.addEventListener('hashchange', handleLocation);

    const handleOpenShare = (e?: any) => {
      if (e?.detail?.source) {
        setShareModalSource(e.detail.source);
      } else {
        setShareModalSource('notepad');
      }
      setIsShareModalOpen(true);
    };
    const handleOpenManager = () => setIsShareManagerOpen(true);
    const handleOpenWhatsApp = () => setIsWhatsAppConfigOpen(true);

    window.addEventListener('open-share-modal', handleOpenShare);
    window.addEventListener('open-share-manager', handleOpenManager);
    window.addEventListener('open-whatsapp-config', handleOpenWhatsApp);

    // Automatically sync any local-only links to Firestore now that rules are active
    syncLocalLinksToCloud().catch(() => {});

    return () => {
      window.removeEventListener('popstate', handleLocation);
      window.removeEventListener('hashchange', handleLocation);
      window.removeEventListener('open-share-modal', handleOpenShare);
      window.removeEventListener('open-share-manager', handleOpenManager);
      window.removeEventListener('open-whatsapp-config', handleOpenWhatsApp);
    };
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Global configured keyboard shortcuts listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        (activeEl as HTMLElement).isContentEditable
      );

      const shortcuts = customShortcuts;

      // 1. Copy Itinerary: Alt + Y (Default)
      if (matchShortcut(e, shortcuts.copyItinerary || 'alt+y')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('copy-itinerary-hotkey'));
        return;
      }

      // 2. Clear Cabins: Alt + C (Default)
      if (matchShortcut(e, shortcuts.clearCabins || 'alt+c')) {
        e.preventDefault();
        setSelectedCabinIds([]);
        return;
      }

      // 3. Reset Notepad: Alt + R (Default)
      if (matchShortcut(e, shortcuts.resetNotepad || 'alt+r')) {
        e.preventDefault();
        clearNotes();
        window.dispatchEvent(new CustomEvent('reset-inquiry-parser-hotkey'));
        return;
      }

      // 4. Toggle Language: Alt + L (Default)
      if (matchShortcut(e, shortcuts.toggleLanguage || 'alt+l')) {
        e.preventDefault();
        const curTab = useStore.getState().tabs.find(t => t.id === useStore.getState().activeTabId);
        const curLang = curTab?.language || 'FR';
        setLanguage(curLang === 'FR' ? 'ENG' : 'FR');
        return;
      }

      // 5. Toggle Notepad Visibility: Alt + N (Default)
      if (matchShortcut(e, shortcuts.toggleNotepad || 'alt+n')) {
        if (isInput) return; // ignore simple single/double triggers in textboxes
        e.preventDefault();
        toggleShowNotepad();
        return;
      }

      // 6. Toggle Media Gallery Visibility: Alt + G (Default)
      if (matchShortcut(e, shortcuts.toggleGallery || 'alt+g')) {
        if (isInput) return;
        e.preventDefault();
        toggleShowMediaGallery();
        return;
      }

      // 7. Toggle Vessel Selector Visibility: Alt + V (Default)
      if (matchShortcut(e, shortcuts.toggleVesselSelector || 'alt+v')) {
        if (isInput) return;
        e.preventDefault();
        toggleShowBoatCabinSelector();
        return;
      }

      // 8. Toggle Inquiry Parser Visibility: Alt + I (Default)
      if (matchShortcut(e, shortcuts.toggleInquiry || 'alt+i')) {
        if (isInput) return;
        e.preventDefault();
        toggleShowInquiryPanel();
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    customShortcuts, 
    setLanguage, 
    setSelectedCabinIds, 
    clearNotes, 
    toggleShowNotepad, 
    toggleShowMediaGallery, 
    toggleShowBoatCabinSelector, 
    toggleShowInquiryPanel
  ]);

  useEffect(() => {
    const hasPrompted = localStorage.getItem('hasPromptedGoogleLogin');
    
    // Listen to firestore auth state
    const unsub = initAuth(
      async (user, token) => {
        if (user && user.email) {
          try {
            const allowed = await getWhitelistedEmails();
            const emailLower = user.email.toLowerCase();
            if (allowed.includes(emailLower)) {
              if (useStore.getState().googleUser?.uid !== user.uid || useStore.getState().googleToken !== token) {
                setGoogleUser(user, token);
              }
              setCheckingAuth(false);
              setShowLoginPrompt(false);
              setImportMode('SHEETS'); // Default import mode to Google Sheets upon login
            } else {
              setLoginError(`Access Denied! ${user.email} is not whitelisted. Please request whitelisting from the administrator in order to sign in as an Operator.`);
              await logout();
              setCheckingAuth(false);
            }
          } catch (e) {
            if (useStore.getState().googleUser?.uid !== user.uid || useStore.getState().googleToken !== token) {
              setGoogleUser(user, token);
            }
            setCheckingAuth(false);
            setShowLoginPrompt(false);
            setImportMode('SHEETS');
          }
        } else {
          if (useStore.getState().googleUser?.uid !== user?.uid || useStore.getState().googleToken !== token) {
            setGoogleUser(user, token);
          }
          setCheckingAuth(false);
          setShowLoginPrompt(false);
          setImportMode('SHEETS');
        }
      },
      () => {
        if (useStore.getState().googleUser !== null || useStore.getState().googleToken !== null) {
          setGoogleUser(null, null);
        }
        setCheckingAuth(false);
        if (!hasPrompted) {
          setShowLoginPrompt(true);
        }
      }
    );
    return () => unsub();
  }, []);

  const handleLoginClick = async () => {
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        if (result.user && result.user.email) {
          const allowed = await getWhitelistedEmails();
          const emailLower = result.user.email.toLowerCase();
          if (allowed.includes(emailLower)) {
            setGoogleUser(result.user, result.accessToken);
            setShowLoginPrompt(false);
            localStorage.setItem('hasPromptedGoogleLogin', 'true');
            setImportMode('SHEETS'); // Default import mode to Google Sheets upon login
          } else {
            setLoginError(`Access Denied! ${result.user.email} is not whitelisted. Please register this email as an Operator.`);
            await logout();
          }
        } else {
          setGoogleUser(result.user, result.accessToken);
          setShowLoginPrompt(false);
          localStorage.setItem('hasPromptedGoogleLogin', 'true');
          setImportMode('SHEETS');
        }
      }
    } catch (err: any) {
      setLoginError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleContinueOffline = () => {
    localStorage.setItem('hasPromptedGoogleLogin', 'true');
    setShowLoginPrompt(false);
  };

  if (currentShareId) {
    return <CustomerSharePage shareId={currentShareId} />;
  }

  // ─── AUTH GATE ───────────────────────────────────────────────────────────────
  // If still checking auth state, show a minimal loading screen
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground font-medium tracking-wide">Verifying access…</p>
        </div>
      </div>
    );
  }

  // If not logged in, block everything and show a branded sign-in wall
  if (!googleUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="w-full max-w-sm flex flex-col items-center gap-8 text-center"
        >
          {/* Logo / Brand */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-xl shadow-primary/20">
              <Ship className="w-9 h-9 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-serif font-bold tracking-tight">CabinGen</h1>
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground font-medium mt-1">Boat Template Engine</p>
            </div>
          </div>

          {/* Access restricted notice */}
          <div className="w-full bg-muted/60 border border-border rounded-2xl p-5 flex flex-col items-center gap-3">
            <Lock className="w-6 h-6 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-semibold text-sm text-foreground">Staff Access Only</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This tool is reserved for authorised operators.<br />
                Please sign in with your whitelisted Google account to continue.
              </p>
            </div>
          </div>

          {/* Error state */}
          {loginError && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full flex items-start gap-2.5 text-left p-3.5 bg-destructive/10 border border-destructive/30 rounded-xl"
            >
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive leading-relaxed">{loginError}</p>
            </motion.div>
          )}

          {/* Sign in button */}
          <button
            onClick={handleLoginClick}
            disabled={isLoggingIn}
            className="w-full h-12 flex items-center justify-center gap-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-primary-foreground font-bold text-sm rounded-xl cursor-pointer transition-all active:scale-[0.98] shadow-lg shadow-primary/20"
          >
            {isLoggingIn ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
            ) : (
              <><LogIn className="w-4 h-4" /> Sign in with Google</>
            )}
          </button>

          <p className="text-[11px] text-muted-foreground/70">
            Only whitelisted operator accounts can access this application.
          </p>
        </motion.div>
      </div>
    );
  }
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-300">
      <style>{`
        @media (min-width: 1024px) {
          .custom-width-container {
            max-width: ${customWidth}% !important;
          }
        }
        @media (max-width: 1023px) {
          .custom-width-container {
            max-width: 95% !important;
          }
        }
      `}</style>
      {/* Header (Not Sticky) */}
      <header className="relative w-full border-b border-border bg-background/80 backdrop-blur-md z-30">
        <div className={cn(
          "mx-auto px-6 h-auto sm:h-20 min-h-[5rem] py-4 sm:py-0 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all duration-500 ease-in-out",
          livePreviewEnabled ? "max-w-[96%] lg:max-w-[94%] xl:max-w-[92%]" : "custom-width-container"
        )}>
          <div className="flex items-center gap-3">
            {googleUser ? (
              <button 
                onClick={() => setIsConfiguratorOpen(true)}
                className="p-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shrink-0 cursor-pointer transition-all hover:scale-[1.03] active:scale-[0.97] flex items-center justify-center shadow-md shadow-primary/10 select-none border-transparent focus:ring-2 focus:ring-ring"
                title="Open Layout & Data Center"
              >
                <Ship className="w-6 h-6" />
              </button>
            ) : (
              <div
                className="p-2 bg-muted text-muted-foreground rounded-xl shrink-0 flex items-center justify-center border border-border/40 cursor-not-allowed select-none"
                title="Staff Only – Please sign in to access settings"
              >
                <Lock className="w-6 h-6" />
              </div>
            )}
            <div className="flex flex-col">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-serif font-bold tracking-tight whitespace-nowrap">CabinGen</h1>
                {googleUser ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[8px] font-bold uppercase tracking-wider border border-blue-500/20 whitespace-nowrap shrink-0">
                    <div className="w-1 h-1 rounded-full bg-blue-500" />
                    Google Synced
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-[8px] font-bold uppercase tracking-wider border border-green-500/20 whitespace-nowrap shrink-0">
                    <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                    Offline / Local
                  </span>
                )}
              </div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium whitespace-nowrap">Boat Template Engine</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-end">
            {/* Connected User navbar account */}
            {!checkingAuth && googleUser && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 dark:bg-stone-900/60 rounded-full border border-border shadow-sm shrink-0">
                {googleUser.photoURL ? (
                  <img
                    src={googleUser.photoURL}
                    alt={googleUser.displayName || "Google Operator"}
                    className="w-5 h-5 rounded-full object-cover shrink-0 select-none border border-border/40"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[9px] shrink-0 border border-border/40 uppercase">
                    {googleUser.email?.charAt(0) || "G"}
                  </div>
                )}
                <div className="flex flex-col max-w-[130px] hidden sm:block leading-none">
                  <span className="text-[10px] font-extrabold text-foreground truncate block">
                    {googleUser.displayName || "Google Operator"}
                  </span>
                </div>
                <button
                  onClick={async () => {
                    await logout();
                    setGoogleUser(null, null);
                    // Reset drive files to clear stale view state
                    setKicFiles([]);
                    setLebaliblogFiles([]);
                  }}
                  title="Sign Out of Google"
                  className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {!checkingAuth && !googleUser && (
              <button
                onClick={handleLoginClick}
                className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shrink-0 cursor-pointer whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign In
              </button>
            )}

            <button
              onClick={() => setShowGuide(true)}
              className="p-2.5 rounded-full bg-muted hover:bg-muted/80 transition-all duration-300 group cursor-pointer flex items-center justify-center shrink-0"
              title="Feature Guide / Help"
            >
              <HelpCircle className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </button>

            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={cn(
        "flex-1 mx-auto w-full px-4 sm:px-6 md:px-8 py-12 space-y-16 transition-all duration-500 ease-in-out",
        livePreviewEnabled ? "max-w-[96%] lg:max-w-[94%] xl:max-w-[92%]" : "custom-width-container"
      )}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 xl:gap-12 transition-all duration-500 ease-in-out">
          {/* Left Column: Configuration */}
          <div className={cn("space-y-12 lg:space-y-16 transition-all duration-500 ease-in-out", livePreviewEnabled ? "lg:col-span-3" : "lg:col-span-7")}>
            <section className="space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="space-y-2">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Step 01</span>
                  <h3 className="text-2xl font-serif italic">Import Data</h3>
                </div>
                
                <div className="flex p-1 bg-muted/50 rounded-xl border border-border/50 backdrop-blur-sm self-start">
                  {[
                    { id: 'FILE', label: 'CSV/Excel' },
                    { id: 'SHEETS', label: 'Google Sheets' }
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setImportMode(mode.id as any)}
                      className={cn(
                        "px-4 py-1.5 rounded-lg text-[9px] font-bold tracking-widest transition-all uppercase whitespace-nowrap cursor-pointer",
                        (importMode === mode.id) 
                          ? "bg-background text-primary shadow-sm ring-1 ring-border" 
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={importMode}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2 }}
                >
                  {importMode === 'FILE' ? <FileUploader /> : <SheetsImporter />}
                </motion.div>
              </AnimatePresence>
              
              <AnimatePresence mode="wait">
                {boats.length > 0 && (
                  <motion.div
                    key="config-steps"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-16"
                  >
                    <div className="space-y-8">
                      <div className="space-y-2">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Step 02</span>
                        <h3 className="text-2xl font-serif italic">Select Boat & Cabins</h3>
                      </div>
                      <TabSwitcher />
                      {showInquiryPanel !== false && <InquiryPanel />}
                      {showBoatCabinSelector !== false && <BoatSelector />}
                    </div>

                    <div className="space-y-8">
                      <div className="space-y-2">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Step 03</span>
                        <h3 className="text-2xl font-serif italic">Template Configuration</h3>
                      </div>
                      <TemplateGenerator />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </div>

          {/* Middle/Right Column: Preview */}
          <div className={cn("transition-all duration-500 ease-in-out", livePreviewEnabled ? "lg:col-span-3" : "lg:col-span-5")}>
            <div className="sticky top-12 space-y-8">
              <div className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Step 04</span>
                <h3 className="text-2xl font-serif italic">Output Preview</h3>
              </div>
              <AnimatePresence mode="wait">
                {selectedBoatName && (activeTab.mode === 'CHARTER' || selectedCabinIds.length > 0) ? (
                  <div className="space-y-6">
                    <OutputPreview key="preview" />
                  </div>
                ) : (
                  <motion.div
                    key="empty-state"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-12 rounded-3xl border border-border bg-card/50 backdrop-blur-sm flex flex-col items-center justify-center text-center gap-6"
                  >
                    <div className="p-4 bg-background rounded-full shadow-sm border border-border">
                      <Info className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div className="space-y-2">
                      <p className="font-medium text-foreground">No Preview Available</p>
                      <p className="text-sm text-muted-foreground max-w-[200px] mx-auto">
                        Complete the steps on the left to generate your templates.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {showMediaGallery !== false && <MediaGallery />}
            </div>
          </div>

          {/* Right Column: Persistent Active Big Preview Panel */}
          <AnimatePresence>
            {livePreviewEnabled && (
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="lg:col-span-6 lg:sticky lg:top-12 self-start h-[calc(100vh-140px)] min-h-[650px] max-h-[850px]"
              >
                <LivePreviewPanel />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {showNotepad !== false && <Notepad />}
      </main>

      <AppGuide isOpen={showGuide} onClose={() => setShowGuide(false)} />
      <AppConfigurator isOpen={isConfiguratorOpen} onClose={() => setIsConfiguratorOpen(false)} />
      <SpotlightSearch />

      <ShareLinkModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        onOpenWhatsAppConfig={() => setIsWhatsAppConfigOpen(true)}
        onOpenManager={() => setIsShareManagerOpen(true)}
        initialSource={shareModalSource}
      />
      <ShareLinksManager
        isOpen={isShareManagerOpen}
        onClose={() => setIsShareManagerOpen(false)}
        onGenerateNew={() => setIsShareModalOpen(true)}
      />
      <WhatsAppConfigModal
        isOpen={isWhatsAppConfigOpen}
        onClose={() => setIsWhatsAppConfigOpen(false)}
      />
    </div>
  );
}
