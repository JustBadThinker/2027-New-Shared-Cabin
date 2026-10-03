import React, { useCallback, useState } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import { useStore } from '../store';
import { parseSpreadsheet } from '../parser';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export const FileUploader: React.FC = () => {
  const { setBoats, fileName, reset } = useStore();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|csv|xls)$/i)) {
      setError('Please upload a valid Excel or CSV file.');
      return;
    }

    try {
      setError(null);
      const boats = await parseSpreadsheet(file);
      if (boats.length === 0) {
        setError('No valid boat data found in the file. Please check the columns.');
        return;
      }
      setBoats(boats, file.name);
    } catch (err) {
      setError('Error parsing file. Please try again.');
      console.error(err);
    }
  }, [setBoats]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  if (fileName) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted rounded-lg">
            <FileText className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground">Spreadsheet uploaded</p>
          </div>
        </div>
        <button 
          onClick={reset}
          className="p-2 hover:bg-muted rounded-full transition-colors"
          title="Remove file"
        >
          <X className="w-4 h-4" />
        </button>
      </motion.div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          "relative group cursor-pointer border-2 border-dashed rounded-2xl p-10 transition-all duration-300 flex flex-col items-center justify-center gap-4 text-center",
          isDragging ? "border-primary bg-muted/50 scale-[1.01]" : "border-border hover:border-muted-foreground bg-card"
        )}
      >
        <input
          type="file"
          className="absolute inset-0 opacity-0 cursor-pointer"
          accept=".xlsx,.xls,.csv"
          onChange={onFileChange}
        />
        <div className="p-4 bg-muted rounded-full group-hover:scale-110 transition-transform duration-300">
          <Upload className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <p className="text-lg font-medium">Upload your spreadsheet</p>
          <p className="text-sm text-muted-foreground mt-1">Drag and drop or click to browse (.xlsx, .csv)</p>
        </div>
      </div>
      <AnimatePresence>
        {error && (
          <motion.p 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-xs text-red-500 font-medium px-2"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
};
