import { useState, useRef, useCallback, useEffect } from 'react';
import { parseConversationJson } from '../jsonImport';
import { t, tf } from '../i18n';
import type { Lang } from '../i18n';

export interface ImportedFile {
  name: string;
  content: string;
  lastModified?: number;
}

export interface CaptureInfo {
  source: string;       // 'chatgpt' | 'claude' | 'gemini'
  messageCount: number;
  charCount: number;
  title?: string;
}

export async function readFileContent(file: File): Promise<{ content: string; lastModified: number }> {
  if (file.size === 0) throw new Error('File is empty');
  if (file.size > 50_000_000) throw new Error('File too large (max 50MB)');
  const name = file.name.toLowerCase();
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsText(file);
    });
    return { content, lastModified: file.lastModified };
  } else if (name.endsWith('.docx')) {
    const { extractDocxText } = await import('../docx');
    const content = await extractDocxText(file);
    return { content, lastModified: file.lastModified };
  } else if (name.endsWith('.json')) {
    const raw = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsText(file);
    });
    const result = parseConversationJson(raw, file.name);
    return { content: result.content, lastModified: result.timestamp ?? file.lastModified };
  }
  throw new Error(`Unsupported format: ${file.name}`);
}

interface UseFileImportParams {
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
  onResetTransform: () => void;
  setError: (err: string) => void;
  files: ImportedFile[];
  setFiles: React.Dispatch<React.SetStateAction<ImportedFile[]>>;
}

export function useFileImport(params: UseFileImportParams) {
  const { lang, showToast, onResetTransform, setError, setFiles } = params;

  const [dragging, setDragging] = useState(false);
  const [captureInfo, setCaptureInfo] = useState<CaptureInfo | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (fileList: File[]) => {
    setError('');
    const newFiles: ImportedFile[] = [];
    const errors: string[] = [];
    for (const file of fileList) {
      try {
        const { content, lastModified } = await readFileContent(file);
        newFiles.push({ name: file.name, content, lastModified });
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[InputView] file read failed:', err);
        errors.push(file.name);
      }
    }
    if (newFiles.length > 0) setFiles((prev) => [...prev, ...newFiles]);
    if (errors.length > 0) setError(tf('errorFileRead', lang, errors.join(', ')));
  }, [lang, setError, setFiles]);

  const handleFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    await addFiles(Array.from(selected));
    e.target.value = '';
  }, [addFiles]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) await addFiles(dropped);
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, [setFiles]);

  // Import from URL hash (extension "Send to Lore" flow — legacy capture-only mode)
  const handleHashImport = useCallback(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#import=')) return;
    try {
      const raw = decodeURIComponent(hash.slice(8));
      window.location.hash = '';
      // Reset state for new import
      onResetTransform();
      setFiles([]);
      // Parse the raw JSON to extract capture metadata before conversion
      let parsed: Record<string, unknown> | null = null;
      try { parsed = JSON.parse(raw); } catch (err) { if (import.meta.env.DEV) console.warn('[InputView] extension JSON parse:', err); }
      const result = parseConversationJson(raw, 'extension-capture.json');
      setFiles([{ name: 'extension-capture.json', content: result.content, lastModified: result.timestamp }]);
      // Build capture info from the raw extension payload
      if (parsed && typeof parsed === 'object' && 'source' in parsed && 'messages' in parsed && Array.isArray(parsed.messages)) {
        const msgs = parsed.messages as Array<{ content?: string }>;
        const info = {
          source: String(parsed.source || 'unknown'),
          messageCount: msgs.length,
          charCount: msgs.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0),
          title: typeof parsed.title === 'string' ? parsed.title : undefined,
        };
        setCaptureInfo(info);
        setTimeout(() => setCaptureInfo((cur) => cur === info ? null : cur), 5000);
      }
      showToast?.(t('extensionReceived', lang), 'success');
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Hash Import] Failed:', err);
      setError('Failed to import from extension.');
    }
  }, [showToast, lang, onResetTransform, setError, setFiles]);

  // Run on mount + listen for hash changes (extension updates URL on existing tab)
  useEffect(() => {
    requestAnimationFrame(() => handleHashImport()); // defer to avoid sync setState in effect
    window.addEventListener('hashchange', handleHashImport);
    return () => window.removeEventListener('hashchange', handleHashImport);
  }, [handleHashImport]);

  return {
    dragging,
    captureInfo,
    setCaptureInfo,
    fileRef,
    handleFiles,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    removeFile,
  };
}
