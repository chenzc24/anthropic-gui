import { useEffect } from 'react';

import './styles.css'; // Import Tailwind styles
import { InspectorPanel } from './components/InspectorPanel';
import { RingCanvas } from './components/RingCanvas';
import { Toolbar } from './components/Toolbar';
import { useIORingStore } from './store/useIORingStore';


export const LayoutEditor = () => {
  const { undo, redo, deleteInstance, selectedId } = useIORingStore();

  // Global shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        e.preventDefault();
      }
      
      // Redo: Ctrl+Y
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        redo();
        e.preventDefault();
      }

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Only if not editing input
        const activeTag = document.activeElement?.tagName;
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA' && selectedId) {
           deleteInstance(selectedId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, deleteInstance, selectedId]);

  return (
    <div className="flex flex-col h-full w-full bg-white relative layout-editor-root">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <InspectorPanel />
        <RingCanvas />
      </div>
    </div>
  );
};

export default LayoutEditor;
