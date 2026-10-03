import React, { useState, useMemo } from 'react';
import { Copy, Check, Trash2, Edit3, Save, LayoutGrid, FileText, Clock, AlertCircle, CheckSquare, Square, GripVertical, ArrowUpNarrowWide, RotateCcw, Link2, Share2, RefreshCw, Languages } from 'lucide-react';
import { useStore, SavedNote, NoteLabel } from '../store';
import { cn, copyTextToClipboard } from '../lib/utils';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { convertStoredNoteFormat } from '../lib/shareService';

const LABEL_CONFIG: Record<NoteLabel, { color: string, bg: string, ring: string }> = {
  'Overbudget': { color: 'text-red-700 dark:text-red-400', bg: 'bg-red-50/80 dark:bg-red-950/20', ring: 'ring-red-100 dark:ring-red-900/30' },
  'Under-budget': { color: 'text-green-700 dark:text-green-400', bg: 'bg-green-50/80 dark:bg-green-950/20', ring: 'ring-green-100 dark:ring-green-900/30' },
  'Marathon': { color: 'text-purple-700 dark:text-purple-400', bg: 'bg-purple-50/80 dark:bg-purple-950/20', ring: 'ring-purple-100 dark:ring-purple-900/30' },
  'Custom Depart': { color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50/80 dark:bg-orange-950/20', ring: 'ring-orange-100 dark:ring-orange-900/30' },
  'None': { color: 'text-muted-foreground', bg: 'bg-muted/40 dark:bg-stone-800/40', ring: 'ring-border/40' }
};

export const Notepad: React.FC = () => {
  const { 
    boats,
    tabs,
    activeTabId,
    savedNotes, 
    updateNote, 
    updateNoteLabel, 
    toggleNoteChecked, 
    sortPriority, 
    setSortPriority, 
    deleteNote, 
    clearNotes 
  } = useStore();

  const activeTab = (tabs.find(t => t.id === activeTabId) || tabs[0] || {}) as any;
  const activeLang: 'FR' | 'ENG' = activeTab.language || 'FR';
  const activeLinkPref: 'AUTO' | 'FR' | 'ENG' = activeTab.linkPreference || 'AUTO';

  const [view, setView] = useState<'CARDS' | 'UNIFIED'>('CARDS');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showSortEditor, setShowSortEditor] = useState(false);
  const [syncedNotice, setSyncedNotice] = useState<string | null>(null);

  const handleConvertNote = (note: SavedNote, lang: 'FR' | 'ENG', linkPref: 'AUTO' | 'FR' | 'ENG') => {
    const converted = convertStoredNoteFormat(note, lang, linkPref, boats);
    updateNote(note.id, converted.content);
    useStore.setState((state) => ({
      savedNotes: state.savedNotes.map(n => n.id === note.id ? { 
        ...n, 
        content: converted.content, 
        boatSnapshot: converted.boatSnapshot 
      } : n)
    }));
  };

  const handleInheritAllFromActiveTab = () => {
    savedNotes.forEach(note => {
      handleConvertNote(note, activeLang, activeLinkPref);
    });
    setSyncedNotice(`Updated ${savedNotes.length} boats to ${activeLang === 'FR' ? 'French / LBB' : 'English / KIC'}`);
    setTimeout(() => setSyncedNotice(null), 2500);
  };

  const sortedNotes = useMemo(() => {
    return [...savedNotes].sort((a, b) => {
      // First sort by checked status (unchecked first)
      if (a.isChecked !== b.isChecked) return a.isChecked ? 1 : -1;
      
      // Then sort by label priority
      const indexA = sortPriority.indexOf(a.label);
      const indexB = sortPriority.indexOf(b.label);
      
      if (indexA !== indexB) return indexA - indexB;
      
      // Finally by date
      return b.createdAt - a.createdAt;
    });
  }, [savedNotes, sortPriority]);

  const handleStartEdit = (note: SavedNote) => {
    setEditingId(note.id);
    setEditContent(note.content);
  };

  const handleSaveEdit = (id: string) => {
    updateNote(id, editContent);
    setEditingId(null);
  };

  const handleCopy = async (id: string, text: string) => {
    await copyTextToClipboard(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getClientColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return {
      main: `hsl(${h}, 50%, 45%)`,
      light: `hsl(${h}, 50%, 96%)`,
      dark: `hsl(${h}, 50%, 20%)`,
    };
  };

  const groupedNotes = useMemo(() => {
    const groups: Record<string, SavedNote[]> = {};
    sortedNotes.forEach(note => {
      const client = note.clientName || 'General';
      if (!groups[client]) groups[client] = [];
      groups[client].push(note);
    });
    return groups;
  }, [sortedNotes]);

  const unifiedText = sortedNotes.map(n => n.content).join('\n\n---\n\n');

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pt-12 border-t border-border"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-serif italic flex items-center gap-3 text-foreground">
            5. Stored Boats
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold not-italic font-sans uppercase tracking-wider">
              {savedNotes.length} {savedNotes.length === 1 ? 'Boat' : 'Boats'}
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">Saved boat proposals ready to copy, switch between KIC and LBB links, or share.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {savedNotes.length > 0 && (
            <button
              onClick={handleInheritAllFromActiveTab}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary transition-all active:scale-95 cursor-pointer"
              title={`Convert all stored boats to active tab settings: ${activeLang === 'FR' ? 'French / LBB' : 'English / KIC'} (${activeLinkPref})`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync All to {activeLang === 'FR' ? 'LBB (FR)' : 'KIC (ENG)'}</span>
            </button>
          )}

          <div className="flex p-1 bg-muted/50 rounded-xl border border-border/50">
            <button
              onClick={() => setView('CARDS')}
              className={cn(
                "p-2 rounded-lg transition-all",
                view === 'CARDS' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              title="Individual Cards (WhatsApp mode)"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('UNIFIED')}
              className={cn(
                "p-2 rounded-lg transition-all",
                view === 'UNIFIED' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              title="Unified View (Email mode)"
            >
              <FileText className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setShowSortEditor(!showSortEditor)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border",
              showSortEditor 
                ? "bg-primary text-primary-foreground border-primary" 
                : "bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted"
            )}
          >
            <ArrowUpNarrowWide className="w-3.5 h-3.5" />
            Sort Rules
          </button>

          {savedNotes.length > 0 && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open-share-modal', { detail: { source: 'notepad' } }))}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-md transition-all active:scale-95 cursor-pointer"
              title="Create a shareable link containing the boats saved in your notepad"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Share Link ({savedNotes.length})</span>
            </button>
          )}
          
          <div className="w-px h-6 bg-border mx-1 hidden md:block" />
          
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); clearNotes(); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-destructive hover:bg-destructive/5 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showSortEditor && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-muted/30 border border-border p-6 rounded-3xl space-y-4">
              <div className="flex items-baseline justify-between mb-2">
                <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                  <GripVertical className="w-3 h-3" />
                  Custom Sort Priority (Drag to reorder)
                </h5>
                <button 
                  onClick={() => setSortPriority(['Overbudget', 'Marathon', 'Custom Depart', 'Under-budget', 'None'])}
                  className="text-[9px] font-bold uppercase text-primary hover:underline flex items-center gap-1"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  Reset Order
                </button>
              </div>
              <Reorder.Group axis="x" values={sortPriority} onReorder={setSortPriority} className="flex flex-wrap gap-3">
                {sortPriority.map((label) => (
                  <Reorder.Item key={label} value={label}>
                    <div className={cn(
                      "cursor-grab active:cursor-grabbing px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all select-none flex items-center gap-2 shadow-sm",
                      LABEL_CONFIG[label].bg,
                      LABEL_CONFIG[label].color,
                      LABEL_CONFIG[label].ring,
                      "ring-1"
                    )}>
                      <GripVertical className="w-3 h-3 opacity-30" />
                      {label}
                    </div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
              <p className="text-[10px] text-muted-foreground italic">Notes will be grouped by these labels in the order shown above. Unchecked items always show first.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {view === 'CARDS' ? (
          <motion.div 
            key="cards"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-12"
          >
            {Object.keys(groupedNotes).map((client) => {
              const notes = groupedNotes[client];
              const clientColor = getClientColor(client);
              return (
                <div key={client} className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="h-px flex-1 bg-border" />
                    <div className="flex items-center gap-2 px-4 py-1 rounded-full border border-border bg-card shadow-sm">
                      <div 
                        className="w-2 h-2 rounded-full" 
                        style={{ backgroundColor: clientColor.main }} 
                      />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: clientColor.main }}>
                        {client}
                      </span>
                    </div>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {notes.map((note) => (
                      <motion.div
                        layout
                        key={note.id}
                        className={cn(
                          "flex flex-col rounded-3xl border transition-all group overflow-hidden relative",
                          note.isChecked 
                            ? "border-border/30 bg-muted/20 opacity-75" 
                            : "border-border bg-card/60 hover:bg-card shadow-sm hover:shadow-md"
                        )}
                        style={{ borderLeftColor: note.isChecked ? undefined : clientColor.main, borderLeftWidth: note.isChecked ? undefined : '4px' }}
                      >
                        {/* Checkbox Background Indicator */}
                        {note.isChecked && (
                          <div className="absolute inset-0 bg-muted/5 pointer-events-none" />
                        )}

                        <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center justify-between relative z-10">
                          <div className="flex items-center gap-3 min-w-0">
                            <button 
                              onClick={() => toggleNoteChecked(note.id)}
                              className={cn(
                                "p-0.5 rounded transition-colors flex-shrink-0",
                                note.isChecked ? "text-primary" : "text-muted-foreground hover:text-primary"
                              )}
                            >
                              {note.isChecked ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                            </button>
                            <div className="flex flex-col min-w-0">
                              <span className={cn(
                                "text-xs font-black uppercase tracking-widest truncate",
                                note.isChecked ? "text-muted-foreground line-through opacity-60" : "text-foreground"
                              )}>
                                {note.title}
                              </span>
                              <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {editingId === note.id ? (
                              <button 
                                onClick={() => handleSaveEdit(note.id)}
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleStartEdit(note)}
                                className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button 
                              onClick={() => deleteNote(note.id)}
                              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="p-5 flex-1 flex flex-col gap-4 relative z-10">
                          {/* Label Selector */}
                          <div className="flex flex-wrap gap-1.5">
                            {(['Overbudget', 'Under-budget', 'Marathon', 'Custom Depart', 'None'] as NoteLabel[]).map(lbl => (
                              <button
                                key={lbl}
                                onClick={() => updateNoteLabel(note.id, lbl)}
                                className={cn(
                                  "px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all border",
                                  note.label === lbl 
                                    ? `${LABEL_CONFIG[lbl].bg} ${LABEL_CONFIG[lbl].color} ${LABEL_CONFIG[lbl].ring} ring-1` 
                                    : "bg-transparent text-muted-foreground/45 border-transparent hover:border-border hover:text-muted-foreground"
                                )}
                              >
                                {lbl === 'None' ? 'No Label' : lbl}
                              </button>
                            ))}
                          </div>

                          {editingId === note.id ? (
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full flex-1 min-h-[140px] bg-background border border-border rounded-2xl p-4 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all custom-scrollbar resize-none text-foreground"
                            />
                          ) : (
                            <div className="w-full flex-1 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                              <pre className={cn(
                                "text-[13px] leading-relaxed whitespace-pre-wrap font-mono",
                                note.isChecked ? "text-muted-foreground/40 italic" : "text-muted-foreground"
                              )}>
                                {note.content}
                              </pre>
                            </div>
                          )}
                          
                          {/* Format & Link quick switcher (LBB vs KIC) */}
                          <div className="pt-2 border-t border-border/40 flex flex-col gap-1.5">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-1 font-bold uppercase tracking-wider">
                                <Languages className="w-3 h-3 text-primary" />
                                Convert Format & Links
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleConvertNote(note, 'FR', 'FR')}
                                className="px-2 py-1 rounded-lg border border-border bg-card/60 hover:bg-muted text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-1 cursor-pointer"
                                title="Convert to French with Lebaliblog (LBB) links"
                              >
                                🇫🇷 LBB (FR)
                              </button>
                              <button
                                type="button"
                                onClick={() => handleConvertNote(note, 'ENG', 'ENG')}
                                className="px-2 py-1 rounded-lg border border-border bg-card/60 hover:bg-muted text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-1 cursor-pointer"
                                title="Convert to English with Komodo Island Cruises (KIC) links"
                              >
                                🇬🇧 KIC (ENG)
                              </button>
                              <button
                                type="button"
                                onClick={() => handleConvertNote(note, activeLang, activeLinkPref)}
                                className="px-2 py-1 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-[10px] font-bold text-primary transition-all flex items-center justify-center gap-1 cursor-pointer"
                                title={`Inherit active tab settings: ${activeLang === 'FR' ? 'French / LBB' : 'English / KIC'} (${activeLinkPref})`}
                              >
                                ⚡ Inherit Tab
                              </button>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => handleCopy(note.id, note.content)}
                            className={cn(
                              "w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold transition-all mt-auto",
                              copiedId === note.id 
                                ? "bg-green-600 text-white shadow-md" 
                                : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50"
                            )}
                          >
                            {copiedId === note.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedId === note.id ? 'Copied!' : 'Copy Template'}
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              );
            })}
          </motion.div>
        ) : (
          <motion.div 
            key="unified"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-4"
          >
            <div className="relative group">
              <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('open-share-modal', { detail: { source: 'notepad' } }))}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-black transition-all shadow-xl active:scale-95 cursor-pointer"
                  title="Generate temporary customer link with all boats from notepad"
                >
                  <Link2 className="w-4 h-4" />
                  <span>Create Share Link ({savedNotes.length})</span>
                </button>
                <button
                  onClick={() => handleCopy('all', unifiedText)}
                  className={cn(
                    "flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-xl cursor-pointer",
                    copiedId === 'all' 
                      ? "bg-green-600 text-white" 
                      : "bg-primary text-primary-foreground hover:opacity-90"
                  )}
                >
                  {copiedId === 'all' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedId === 'all' ? 'Entire List Copied' : 'Copy All for Email'}</span>
                </button>
              </div>
              <textarea
                readOnly
                value={unifiedText}
                className="w-full min-h-[500px] p-8 pb-20 rounded-3xl border border-border bg-card/60 backdrop-blur-sm font-mono text-[13px] leading-relaxed whitespace-pre-wrap outline-none focus:ring-2 focus:ring-primary/10 transition-all custom-scrollbar text-foreground"
              />
              <div className="absolute bottom-6 left-8 right-8 flex items-center gap-4 text-[10px] text-muted-foreground/60 uppercase tracking-widest pointer-events-none">
                <AlertCircle className="w-3 h-3" />
                <span>Format: Sorted by your custom rules with dividers for batch copying</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
