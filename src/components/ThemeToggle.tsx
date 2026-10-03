import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useStore } from '../store';
import { motion } from 'motion/react';

export const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useStore();

  const toggle = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  // Initialize theme on mount
  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <button
      onClick={toggle}
      className="p-2.5 rounded-full bg-muted hover:bg-muted/80 transition-all duration-300 group"
      aria-label="Toggle theme"
    >
      <motion.div
        initial={false}
        animate={{ rotate: theme === 'light' ? 0 : 180 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
      >
        {theme === 'light' ? (
          <Sun className="w-5 h-5 text-orange-500" />
        ) : (
          <Moon className="w-5 h-5 text-blue-400" />
        )}
      </motion.div>
    </button>
  );
};
