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
import { Ship, Info, LogIn, LogOut, Check, AlertCircle, FileSpreadsheet, Image as ImageIcon, Loader2, HelpCircle, Link2, MessageCircle } from 'lucide-react';
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
            <button 
              onClick={() => setIsConfiguratorOpen(true)}
              className="p-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shrink-0 cursor-pointer transition-all hover:scale-[1.03] active:scale-[0.97] flex items-center justify-center shadow-md shadow-primary/10 select-none border-transparent focus:ring-2 focus:ring-ring"
              title="Open Layout & Data Center"
            >
              <Ship className="w-6 h-6" />
            </button>
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

      {/* Google Sign-in Synchronisation Modal wrapper */}
      <AnimatePresence>
        {showLoginPrompt && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-hidden select-none">
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative w-full max-w-md bg-card border border-border rounded-3xl p-8 shadow-2xl flex flex-col gap-6 text-center"
            >
              {/* Icon */}
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto shadow-sm">
                <FileSpreadsheet className="w-8 h-8" />
              </div>

              {/* Title & Desc */}
              <div className="space-y-2">
                <h3 className="text-xl font-serif font-bold tracking-tight text-foreground">
                  Connect Google Workspace
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Connect your Google account with read-only permissions to instantly sync cabin images from your shared Drive folders and generate boat availability lists straight from Google Sheets!
                </p>
              </div>

              {loginError && (
                <div className="p-3.5 bg-destructive/5 text-destructive rounded-xl border border-destructive/10 text-xs text-left leading-relaxed flex items-start gap-2 max-h-32 overflow-y-auto">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-destructive" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* Interactive choices */}
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={handleLoginClick}
                  disabled={isLoggingIn}
                  className="w-full h-12 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md disabled:opacity-65"
                >
                  {isLoggingIn ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Connecting Account...
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      Sign-In with Google
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleContinueOffline}
                  disabled={isLoggingIn}
                  className="w-full h-12 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-foreground font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  Continue Offline / Skip
                </button>
              </div>

              {/* Helpful footer */}
              <div className="text-[10px] text-muted-foreground/80 leading-normal flex items-start gap-1.5 text-left bg-muted/40 p-3.5 rounded-xl border border-border/40">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>
                  You can also use files locally. Upload raw Excel or CSV files inside <strong>Step 1</strong> at any time to work without cloud integrations.
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
