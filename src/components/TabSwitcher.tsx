import React, { useState } from 'react';
import { useStore } from '../store';
import { Plus, X, User, Edit2, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export const TabSwitcher: React.FC = () => {
  const { tabs, activeTabId, setActiveTabId, addTab, removeTab, renameTab } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const startRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const saveRename = (id: string) => {
    if (editName.trim() && editName.trim() !== tabs.find(t => t.id === id)?.name) {
      renameTab(id, editName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar scroll-smooth">
        {tabs.map((tab) => (
          <div key={tab.id} className="relative group flex-shrink-0">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setActiveTabId(tab.id)}
              onDoubleClick={() => startRename(tab.id, tab.name)}
              onKeyDown={(e) => e.key === 'Enter' && setActiveTabId(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border min-w-[120px] justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20",
                activeTabId === tab.id
                  ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                  : "bg-card border-border hover:border-primary/50 text-muted-foreground"
              )}
            >
              <div className="flex items-center gap-2 min-w-0 pr-4">
                <User className="w-3 h-3 opacity-50" />
                {editingId === tab.id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => saveRename(tab.id)}
                    onKeyDown={(e) => e.key === 'Enter' && saveRename(tab.id)}
                    className="bg-transparent border-none outline-none text-inherit w-full font-bold focus:ring-0 p-0"
                  />
                ) : (
                  <span className="truncate">{tab.name}</span>
                )}
              </div>
              
              {activeTabId === tab.id && editingId !== tab.id && (
                <button 
                  onClick={(e) => { e.stopPropagation(); startRename(tab.id, tab.name); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-primary-foreground/10 rounded cursor-pointer"
                >
                  <Edit2 className="w-2.5 h-2.5" />
                </button>
              )}
            </div>

            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeTab(tab.id);
                }}
                className={cn(
                  "absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground border-2 border-background flex items-center justify-center opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all",
                  activeTabId === tab.id && "group-hover:opacity-100"
                )}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        ))}

        <button
          onClick={addTab}
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border border-dashed border-border hover:border-primary hover:text-primary transition-all text-muted-foreground"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Client
        </button>
      </div>
    </div>
  );
};
