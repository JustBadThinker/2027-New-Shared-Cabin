import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  LogIn, 
  RefreshCcw, 
  Check, 
  AlertCircle, 
  ChevronDown, 
  TableProperties, 
  FileSpreadsheet,
  Sparkles
} from 'lucide-react';
import { useStore } from '../store';
import { googleSignIn, getAccessToken, logout } from '../lib/firebase';
import { processWorkbookData } from '../parser';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export const SheetsImporter: React.FC = () => {
  const { 
    boats, 
    tabs, 
    activeTabId, 
    setBoats, 
    setSheetsConfig, 
    setAvailableSheets,
    googleUser,
    googleToken,
    setGoogleUser,
    setKicFiles,
    setLebaliblogFiles,
    fetchDriveImages
  } = useStore();
  const activeTab = (tabs.find(t => t.id === activeTabId) || tabs[0] || {}) as any;
  const sheetsConfig = activeTab.sheetsConfig || { spreadsheetId: '', sheetName: '', lastSynced: null };
  const availableSheets = activeTab.availableSheets || [];

  const [url, setUrl] = useState('https://docs.google.com/spreadsheets/d/18vgalCOZ1BgAE4WzqfDsh22XmjYwiDyeOHWtQe9eFA8');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // Auto-fill URL from active sheets config if loaded
  useEffect(() => {
    if (sheetsConfig.spreadsheetId) {
      setUrl(`https://docs.google.com/spreadsheets/d/${sheetsConfig.spreadsheetId}`);
    }
  }, [sheetsConfig.spreadsheetId]);

  useEffect(() => {
    setIsAuthChecking(false);
  }, [googleUser]);

  const handleLogin = async () => {
    setError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user, result.accessToken);
        fetchDriveImages(result.accessToken);
      }
    } catch (err: any) {
      if (err.message.includes('closed before completion')) {
        setError('The sign-in window was closed. If you saw an "Access Blocked" error, make sure you are using a permitted account or that the developer has enabled access for you.');
      } else {
        setError(err.message || 'Login failed. Please try again.');
      }
    }
  };

  const handleLogout = async () => {
    await logout();
    setGoogleUser(null, null);
    setKicFiles([]);
    setLebaliblogFiles([]);
  };

  const extractSpreadsheetId = (input: string) => {
    if (!input) return null;
    if (input.match(/^[a-zA-Z0-9-_]{15,}$/)) return input;
    const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  };

  const fetchSheetNames = async (spreadsheetId: string) => {
    const token = getAccessToken();
    if (!token) {
      handleLogin();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch spreadsheet info. Verify spreadsheet access permissions.');
      
      const data = await res.json();
      const names = data.sheets.map((s: any) => s.properties.title);
      setAvailableSheets(names);
      setSheetsConfig({ spreadsheetId });
      
      if (names.length > 0 && !sheetsConfig.sheetName) {
        setSheetsConfig({ sheetName: names[0] });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const importData = async (spreadsheetId: string, sheetName: string) => {
    const token = getAccessToken();
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const range = `${sheetName}!A:Z`;
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch sheet data.');

      const data = await res.json();
      if (!data.values || data.values.length === 0) {
        throw new Error('This specific sheet is empty or contains no valid rows.');
      }

      const boats = processWorkbookData(data.values);
      setBoats(boats, `Google Sheet: ${sheetName}`);
      setSheetsConfig({ lastSynced: new Date().toISOString() });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractSpreadsheetId(url);
    if (!id) {
      setError('Invalid Google Sheets URL format.');
      return;
    }
    fetchSheetNames(id);
  };

  if (isAuthChecking) {
    return (
      <div className="flex items-center justify-center p-8 bg-muted/30 rounded-3xl animate-pulse">
        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mr-3">Verifying authentication...</div>
        <RefreshCcw className="w-4 h-4 animate-spin text-primary" />
      </div>
    );
  }

  if (!googleUser) {
    return (
      <div className="flex flex-col items-center gap-6 p-10 bg-card/50 backdrop-blur-sm border border-border rounded-3xl text-center">
        <div className="p-4 bg-primary/5 rounded-full ring-8 ring-primary/5">
          <FileSpreadsheet className="w-8 h-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h4 className="text-xl font-serif italic">Google Sheets Sync</h4>
          <p className="text-sm text-muted-foreground max-w-xs">
            Connect your Google account with permission to sync boat and cabin details straight from your spreadsheets.
          </p>
        </div>
        <button
          onClick={handleLogin}
          className="gsi-material-button bg-white text-[#1f1f1f] border border-[#747775] rounded-[20px] px-4 py-2 flex items-center justify-center gap-2 hover:bg-[#f2f2f2] transition-colors shadow-sm cursor-pointer"
          style={{ fontFamily: "'Roboto', arial, sans-serif", fontSize: '14px', fontWeight: '500' }}
        >
          <div className="gsi-material-button-icon w-5 h-5">
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              <path fill="none" d="M0 0h48v48H0z"></path>
            </svg>
          </div>
          <span className="gsi-material-button-contents">Sign in with Google</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-primary" />
          Synchronize Spreadsheet
        </span>
        <p className="text-xs text-muted-foreground">
          Paste the web link of your target Google Sheets workbook to fetch available tabs and synchronize details.
        </p>
      </div>

      <form onSubmit={handleUrlSubmit} className="relative group">
        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
        <input
          type="text"
          placeholder="Paste Google Sheets URL here..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full pl-12 pr-32 py-4 rounded-2xl border border-border bg-card/50 backdrop-blur-sm focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-sm"
        />
        <button
          type="submit"
          disabled={loading || !url}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 transition-all cursor-pointer"
        >
          {loading ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : 'Fetch Info'}
        </button>
      </form>

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 bg-destructive/5 text-destructive rounded-2xl border border-destructive/10 text-xs"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </motion.div>
      )}

      <AnimatePresence>
        {availableSheets.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4 overflow-hidden pt-2 border-t border-border/40"
          >
            <div className="space-y-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 p-1">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Configure Synced Sheet
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <div className="relative flex-1 group">
                <TableProperties className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <select
                  value={sheetsConfig.sheetName}
                  onChange={(e) => setSheetsConfig({ sheetName: e.target.value })}
                  className="w-full pl-12 pr-10 py-4 appearance-none rounded-2xl border border-border bg-card/50 backdrop-blur-sm focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-sm font-medium"
                >
                  <option value="" disabled>Select a sheet tab...</option>
                  {availableSheets.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>

              <button
                onClick={() => importData(sheetsConfig.spreadsheetId, sheetsConfig.sheetName)}
                disabled={loading || !sheetsConfig.sheetName}
                className="flex items-center justify-center gap-3 px-8 py-4 bg-foreground text-background rounded-2xl font-black uppercase tracking-widest text-[10px] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCcw className="w-3.5 h-3.5" />
                )}
                {sheetsConfig.lastSynced ? 'Sync Now' : 'Sync & Import'}
              </button>
            </div>

            {sheetsConfig.lastSynced && (
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Synced {new Date(sheetsConfig.lastSynced).toLocaleTimeString()}
                </div>
                <button
                  onClick={handleLogout}
                  className="text-[10px] text-muted-foreground hover:text-destructive font-medium uppercase tracking-widest transition-colors cursor-pointer"
                >
                  Disconnect Account
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

