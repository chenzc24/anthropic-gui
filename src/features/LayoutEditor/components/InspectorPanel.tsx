import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useIORingStore } from '../store/useIORingStore';
import { Instance } from '../types';

import { PropertyEditor } from './PropertyEditor';

export const InspectorPanel: React.FC = () => {
  const { graph, selectedId, selectedIds, updateInstance, updateRingConfig } =
    useIORingStore();
  const panelRef = useRef<HTMLDivElement>(null);

  const selectedInstance = selectedId
    ? graph.instances.find((i: Instance) => i.id === selectedId)
    : null;

  const editorMode = selectedInstance
    ? `instance:${selectedInstance.id}`
    : 'global';
  const sourceData = useMemo(
    () => selectedInstance || graph.ring_config,
    [graph.ring_config, selectedInstance],
  );

  const [draftData, setDraftData] = useState<any>(sourceData);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setDraftData(sourceData);
    setIsDirty(false);
  }, [editorMode, sourceData]);

  const handleSave = useCallback(() => {
    if (!isDirty) return;

    if (selectedInstance) {
      updateInstance(selectedInstance.id, draftData);
    } else {
      updateRingConfig(draftData);
    }

    setIsDirty(false);
  }, [draftData, isDirty, selectedInstance, updateInstance, updateRingConfig]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!isDirty) return;

      const target = event.target as Node | null;
      if (!target) return;

      if (panelRef.current?.contains(target)) {
        return;
      }

      handleSave();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [handleSave, isDirty]);

  return (
    <div
      ref={panelRef}
      className="w-80 border-r bg-white flex flex-col h-full min-h-0 shrink-0 overflow-hidden"
    >
      <div className="p-4 bg-gray-50 border-b font-medium text-gray-800 flex items-center justify-between gap-3">
        <span>Inspector</span>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty}
          className={`px-3 py-1 rounded text-xs font-medium ${
            isDirty
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 text-gray-500 cursor-not-allowed'
          }`}
        >
          Save
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {selectedInstance ? (
          <div>
            <div className="mb-4 pb-2 border-b">
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                Instance
              </span>
              <h2 className="text-lg font-bold mt-1 text-gray-800">
                {selectedInstance.name}
              </h2>
              {selectedIds.length > 1 && (
                <p className="mt-1 text-xs text-blue-600">
                  Multi-selected: {selectedIds.length} instances (editing active
                  one)
                </p>
              )}
            </div>

            <PropertyEditor
              data={draftData}
              onChange={(newData: any) => {
                setDraftData(newData);
                setIsDirty(true);
              }}
              readOnlyKeys={[]}
              ringConfig={graph.ring_config}
            />
          </div>
        ) : (
          <div>
            <div className="mb-4 pb-2 border-b">
              <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                Global
              </span>
              <h2 className="text-lg font-bold mt-1 text-gray-800">
                Ring Config
              </h2>
            </div>

            <PropertyEditor
              data={draftData}
              onChange={(newData: any) => {
                setDraftData(newData);
                setIsDirty(true);
              }}
              readOnlyKeys={[]}
              ringConfig={graph.ring_config}
            />

            <div className="mt-8 p-4 bg-blue-50 rounded text-sm text-blue-800">
              <p>Select an instance on the ring to edit its properties.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
