import { useEffect } from 'react';

import { InspectorPanel } from './components/InspectorPanel';
import { RingCanvas } from './components/RingCanvas';
import { Toolbar } from './components/Toolbar';
import { useIORingStore } from './store/useIORingStore';
import './styles.css';
import { importAdapter } from './utils/ioAdapter';

const IO_EDITOR_PENDING_KEY = 'io_editor_pending_file';

export const LayoutEditor = () => {
  const {
    undo,
    redo,
    deleteInstances,
    selectedIds,
    setGraph,
    setEditorSourcePath,
  } = useIORingStore();

  useEffect(() => {
    const tryLoadPendingEditorFile = async () => {
      const raw = localStorage.getItem(IO_EDITOR_PENDING_KEY);
      if (!raw) return;

      try {
        const pending = JSON.parse(raw);
        const fileUrl = pending?.url;
        const filePath = pending?.path || null;
        if (!fileUrl) return;

        const res = await fetch(fileUrl);
        if (!res.ok) {
          throw new Error(`Failed to load editor JSON: ${res.status}`);
        }

        const json = await res.json();
        const internalGraph = importAdapter(json);
        setGraph(internalGraph);
        setEditorSourcePath(filePath);
      } catch (error) {
        void error;
      } finally {
        localStorage.removeItem(IO_EDITOR_PENDING_KEY);
      }
    };

    void tryLoadPendingEditorFile();
  }, [setGraph, setEditorSourcePath]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        e.preventDefault();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        redo();
        e.preventDefault();
      }

      if (e.key === 'Delete') {
        const activeTag = document.activeElement?.tagName;
        if (
          activeTag !== 'INPUT' &&
          activeTag !== 'TEXTAREA' &&
          selectedIds.length > 0
        ) {
          deleteInstances(selectedIds);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, deleteInstances, selectedIds]);

  return (
    <div className="flex flex-col h-screen w-full bg-white relative layout-editor-root overflow-hidden">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden min-h-0 min-w-0">
        <InspectorPanel />
        <RingCanvas />
      </div>
    </div>
  );
};

export default LayoutEditor;
