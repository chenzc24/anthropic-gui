import React, { useRef, useState } from 'react';

import {
  Upload,
  Download,
  Undo,
  Redo,
  Plus,
  Trash2,
  Check,
  ArrowLeft,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { submitEditorConfirm } from '@/api/prompt.api';
import { ROUTES } from '@/app/router/constants/routes';

import { useIORingStore } from '../store/useIORingStore';
import { importAdapter, exportAdapter } from '../utils/ioAdapter';

const IO_EDITOR_RETURN_KEY = 'io_editor_return_path';

export const Toolbar: React.FC = () => {
  const navigate = useNavigate();
  const {
    graph,
    setGraph,
    undo,
    redo,
    history,
    addInstance,
    selectedIds,
    deleteInstances,
    editorSourcePath,
    editorProcessNode,
    setEditorSourcePath,
    setEditorProcessNode,
  } = useIORingStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const isT28 = String(graph?.ring_config?.process_node || '')
    .toUpperCase()
    .includes('28');

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      try {
        const json = JSON.parse(event.target?.result as string);
        // Use adapter to convert external format to internal store format
        const internalGraph = importAdapter(json);
        setGraph(internalGraph);
      } catch (err) {
        void err;
        alert('Invalid JSON file or format error');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
  };

  const handleExport = () => {
    // Use adapter to convert internal store format back to external format
    const externalGraph = exportAdapter(graph);

    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(externalGraph, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', 'io_ring_intent_edited.json');
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleConfirmAndContinue = async () => {
    const sourcePath = editorSourcePath;
    if (!sourcePath) {
      alert('No pending backend editor session found.');
      return;
    }

    try {
      setIsConfirming(true);
      const externalGraph = exportAdapter(graph);
      const resolvedProcessNode =
        (typeof graph?.ring_config?.process_node === 'string' &&
          graph.ring_config.process_node) ||
        editorProcessNode;

      const confirmPayload = {
        ...externalGraph,
        ring_config: {
          ...(externalGraph?.ring_config || {}),
          ...(resolvedProcessNode
            ? { process_node: String(resolvedProcessNode).toUpperCase() }
            : {}),
        },
      };

      await submitEditorConfirm(sourcePath, confirmPayload);
      alert(
        'Editor changes submitted. Backend layout generation should continue now.',
      );
      setEditorSourcePath(null);
      setEditorProcessNode(null);
    } catch (err) {
      void err;
      alert('Failed to submit editor confirmation. Please retry.');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleBackToChat = () => {
    const returnPath = localStorage.getItem(IO_EDITOR_RETURN_KEY);
    if (returnPath && returnPath.startsWith('/chat')) {
      navigate(returnPath);
      return;
    }
    navigate(ROUTES.Chat);
  };
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const addFromMenu = (
    e: React.MouseEvent<HTMLButtonElement>,
    type?: string,
  ) => {
    addInstance('top', type);
    e.currentTarget.closest('details')?.removeAttribute('open');
  };

  return (
    <div className="h-14 border-b bg-gray-50 flex items-center px-4 justify-between select-none">
      <div className="flex items-center gap-2">
        <button
          onClick={handleBackToChat}
          className="p-2 hover:bg-gray-200 rounded text-gray-600"
          title="Back to Chat"
        >
          <ArrowLeft size={18} />
        </button>
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
          <button
            onClick={handleConfirmAndContinue}
            disabled={!editorSourcePath || isConfirming}
            className={`p-2 rounded ${
              editorSourcePath && !isConfirming
                ? 'hover:bg-green-100 text-green-700'
                : 'text-gray-300'
            }`}
            title="Confirm & Continue Backend"
          >
            <Check size={18} />
          </button>
        </div>

        <div className="flex items-center gap-1 border-r pr-2 mr-2">
          <button
            onClick={undo}
            disabled={!canUndo}
            className={`p-2 rounded ${
              canUndo ? 'hover:bg-gray-200 text-gray-600' : 'text-gray-300'
            }`}
            title="Undo"
          >
            <Undo size={18} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className={`p-2 rounded ${
              canRedo ? 'hover:bg-gray-200 text-gray-600' : 'text-gray-300'
            }`}
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
                onClick={e => addFromMenu(e)}
                className="text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded w-full"
              >
                IO Pad
              </button>
              <button
                onClick={e => addFromMenu(e, 'filler')}
                className="text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded w-full"
              >
                Filler
              </button>
              <button
                onClick={e => addFromMenu(e, 'corner')}
                className="text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded w-full"
              >
                Corner
              </button>
              {isT28 && (
                <button
                  onClick={e => addFromMenu(e, 'cut')}
                  className="text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded w-full"
                >
                  CUT
                </button>
              )}
              {!isT28 && (
                <button
                  onClick={e => addFromMenu(e, 'blank')}
                  className="text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded w-full"
                >
                  Blank
                </button>
              )}
            </div>
          </details>

          {selectedIds.length > 0 && (
            <button
              onClick={() => deleteInstances(selectedIds)}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-600 rounded hover:bg-red-200 text-sm"
            >
              <Trash2 size={16} />
              {selectedIds.length > 1
                ? `Delete Selected (${selectedIds.length})`
                : 'Delete Selected'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
