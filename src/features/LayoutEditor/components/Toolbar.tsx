import React, { useRef } from 'react';
import { Upload, Download, Undo, Redo, Plus, Trash2 } from 'lucide-react';

import { useIORingStore } from '../store/useIORingStore';
import { importAdapter, exportAdapter } from '../utils/ioAdapter';

export const Toolbar: React.FC = () => {
  const { 
    graph, setGraph, undo, redo, 
    history, addInstance, selectedId, deleteInstance 
  } = useIORingStore();
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        // Use adapter to convert external format to internal store format
        const internalGraph = importAdapter(json);
        setGraph(internalGraph);
      } catch (err) {
        console.error(err);
        alert('Invalid JSON file or format error');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
  };

  const handleExport = () => {
    // Use adapter to convert internal store format back to external format
    const externalGraph = exportAdapter(graph);
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(externalGraph, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "io_ring_intent_edited.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  return (
    <div className="h-14 border-b bg-gray-50 flex items-center px-4 justify-between select-none">
      <div className="flex items-center gap-2">
        <h1 className="font-bold text-lg text-gray-700 mr-4">IO Ring Editor</h1>
        
        <div className="flex items-center gap-1 border-r pr-2 mr-2">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2 hover:bg-gray-200 rounded text-gray-600"
            title="Import JSON"
          >
            <Upload size={18} />
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImport} 
            className="hidden" 
            accept=".json"
          />
          <button 
            onClick={handleExport}
            className="p-2 hover:bg-gray-200 rounded text-gray-600"
            title="Export JSON"
          >
            <Download size={18} />
          </button>
        </div>

        <div className="flex items-center gap-1 border-r pr-2 mr-2">
          <button 
            onClick={undo} disabled={!canUndo}
            className={`p-2 rounded ${canUndo ? 'hover:bg-gray-200 text-gray-600' : 'text-gray-300'}`}
            title="Undo"
          >
            <Undo size={18} />
          </button>
          <button 
            onClick={redo} disabled={!canRedo}
            className={`p-2 rounded ${canRedo ? 'hover:bg-gray-200 text-gray-600' : 'text-gray-300'}`}
            title="Redo"
          >
            <Redo size={18} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <details className="relative group mr-2">
            <summary className="list-none cursor-pointer bg-blue-600 text-white px-3 py-1.5 rounded flex items-center gap-1 text-sm hover:bg-blue-700 select-none">
              <Plus size={16} /> Add Device
            </summary>
            {/* The dropdown content */}
            <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 shadow-lg rounded p-1 flex flex-col w-40 z-50">
              <button 
                onClick={(e) => {
                  addInstance('top');
                  e.currentTarget.closest('details')?.removeAttribute('open');
                }}
                className="text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded w-full"
              >
                IO Pad
              </button>
              <button 
                onClick={(e) => {
                  addInstance('top', 'filler');
                  e.currentTarget.closest('details')?.removeAttribute('open');
                }}
                className="text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded w-full"
              >
                Filler
              </button>
              <button 
                onClick={(e) => {
                  addInstance('top', 'space');
                  e.currentTarget.closest('details')?.removeAttribute('open');
                }}
                className="text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded w-full"
              >
                Space
              </button>
            </div>
          </details>
          
          {selectedId && (
             <button 
             onClick={() => deleteInstance(selectedId)}
             className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-600 rounded hover:bg-red-200 text-sm"
           >
             <Trash2 size={16} /> Delete Selected
           </button>
          )}
        </div>
      </div>
    </div>
  );
};
