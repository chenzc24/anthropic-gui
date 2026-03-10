import { useEffect } from 'react';

import { InspectorPanel } from './components/InspectorPanel';
import { RingCanvas } from './components/RingCanvas';
import { Toolbar } from './components/Toolbar';
import { useIORingStore } from './store/useIORingStore';
import './styles.css';
import { importAdapter } from './utils/ioAdapter';

const IO_EDITOR_PENDING_KEY = 'io_editor_pending_file';
const IO_EDITOR_PENDING_UPDATED_EVENT = 'io-editor-pending-updated';

export const LayoutEditor = () => {
  const {
    undo,
    redo,
    deleteInstances,
    selectedIds,
    setGraph,
    setEditorSourcePath,
    setEditorProcessNode,
  } = useIORingStore();

  useEffect(() => {
    const tryLoadPendingEditorFile = async () => {
      const raw = localStorage.getItem(IO_EDITOR_PENDING_KEY);
      if (!raw) return;

      let loaded = false;

      try {
        const pending = JSON.parse(raw);
        const fileUrl = pending?.url;
        const filePath = pending?.path || null;
        const pendingProcessNode =
          typeof pending?.process_node === 'string' && pending.process_node
            ? String(pending.process_node).toUpperCase()
            : null;
        if (!fileUrl) return;

        const res = await fetch(fileUrl);
        if (!res.ok) {
          throw new Error(`Failed to load editor JSON: ${res.status}`);
        }

        const json = await res.json();
        const jsonProcessNode =
          typeof json?.ring_config?.process_node === 'string' &&
          json?.ring_config?.process_node
            ? String(json.ring_config.process_node).toUpperCase()
            : null;
        const resolvedProcessNode = jsonProcessNode || pendingProcessNode;

        const graphSource = {
          ...json,
          ring_config: {
            ...(json?.ring_config || {}),
            ...(resolvedProcessNode
              ? { process_node: resolvedProcessNode }
              : {}),
          },
        };

        const internalGraph = importAdapter(graphSource);
        setGraph(internalGraph);
        setEditorSourcePath(filePath);
        setEditorProcessNode(resolvedProcessNode);
        loaded = true;
      } catch (error) {
        void error;
      } finally {
        if (loaded) {
          localStorage.removeItem(IO_EDITOR_PENDING_KEY);
        }
      }
    };

    const handlePendingUpdated = () => {
      void tryLoadPendingEditorFile();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === IO_EDITOR_PENDING_KEY && event.newValue) {
        void tryLoadPendingEditorFile();
      }
    };

    void tryLoadPendingEditorFile();

    window.addEventListener(
      IO_EDITOR_PENDING_UPDATED_EVENT,
      handlePendingUpdated,
    );
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(
        IO_EDITOR_PENDING_UPDATED_EVENT,
        handlePendingUpdated,
      );
      window.removeEventListener('storage', handleStorage);
    };
  }, [setGraph, setEditorProcessNode, setEditorSourcePath]);

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
