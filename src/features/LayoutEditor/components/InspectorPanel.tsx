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

const isPlainObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizePinConnection = (
  value: unknown,
): Record<string, string> | null => {
  if (!isPlainObject(value)) {
    return null;
  }

  const normalized: Record<string, string> = {};
  Object.entries(value).forEach(([pin, entry]) => {
    if (isPlainObject(entry)) {
      normalized[pin] = String(entry.label ?? '');
      return;
    }

    normalized[pin] = String(entry ?? '');
  });

  return normalized;
};

const pinConnectionsEqual = (left: unknown, right: unknown): boolean => {
  const l = normalizePinConnection(left);
  const r = normalizePinConnection(right);
  if (!l && !r) return true;
  if (!l || !r) return false;
  return JSON.stringify(l) === JSON.stringify(r);
};

const pinListSignature = (value: unknown): string | null => {
  const normalized = normalizePinConnection(value);
  if (!normalized) {
    return null;
  }

  const keys = Object.keys(normalized).sort();
  if (keys.length === 0) {
    return null;
  }

  return JSON.stringify(keys);
};

const supportsPinBatch = (
  inst: Instance | null | undefined,
): inst is Instance => {
  if (!inst) return false;

  const type = String(inst.type || '').toLowerCase();
  const device = String(inst.device || '').toUpperCase();

  if (type === 'corner') return false;
  if (
    type === 'filler' ||
    type === 'blank' ||
    type === 'space' ||
    type === 'cut'
  ) {
    return false;
  }

  if (
    device.includes('CORNER') ||
    device.includes('FILLER') ||
    device.includes('RCUT') ||
    device === 'BLANK'
  ) {
    return false;
  }

  return true;
};

export const InspectorPanel: React.FC = () => {
  const {
    graph,
    selectedId,
    selectedIds,
    updateInstance,
    updateInstancesPinConnection,
    updateRingConfig,
  } = useIORingStore();
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
  const draftDataRef = useRef<any>(sourceData);
  const isDirtyRef = useRef(false);

  const compatiblePinBatchIds = useMemo(() => {
    if (!supportsPinBatch(selectedInstance) || selectedIds.length <= 1) {
      return [];
    }

    const targetPinSignature = pinListSignature(
      selectedInstance.pin_connection,
    );
    if (!targetPinSignature) {
      return [];
    }

    return selectedIds.filter(id => {
      const inst = graph.instances.find(item => item.id === id) || null;
      if (!supportsPinBatch(inst)) return false;

      return pinListSignature(inst.pin_connection) === targetPinSignature;
    });
  }, [graph.instances, selectedIds, selectedInstance]);

  useEffect(() => {
    setDraftData(sourceData);
    draftDataRef.current = sourceData;
    setIsDirty(false);
    isDirtyRef.current = false;
  }, [editorMode, sourceData]);

  useEffect(() => {
    draftDataRef.current = draftData;
  }, [draftData]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const handleSave = useCallback(() => {
    if (!isDirtyRef.current) return;

    const currentDraft = draftDataRef.current;

    if (selectedInstance) {
      const sourcePin = selectedInstance.pin_connection;
      const draftPin = currentDraft?.pin_connection;
      const pinChanged = !pinConnectionsEqual(sourcePin, draftPin);
      const shouldBatchPin =
        pinChanged &&
        compatiblePinBatchIds.length > 1 &&
        supportsPinBatch(selectedInstance);

      if (shouldBatchPin) {
        updateInstancesPinConnection(compatiblePinBatchIds, draftPin);
      }

      const nextDraftForActive = shouldBatchPin
        ? {
            ...currentDraft,
            pin_connection: sourcePin,
          }
        : currentDraft;

      const changedKeys = Object.keys(nextDraftForActive || {}).filter(
        key =>
          JSON.stringify(nextDraftForActive[key]) !==
          JSON.stringify((selectedInstance as any)?.[key]),
      );

      if (changedKeys.length > 0) {
        updateInstance(selectedInstance.id, nextDraftForActive);
      }
    } else {
      updateRingConfig(currentDraft);
    }

    setIsDirty(false);
    isDirtyRef.current = false;
  }, [
    compatiblePinBatchIds,
    selectedInstance,
    updateInstance,
    updateInstancesPinConnection,
    updateRingConfig,
  ]);

  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (!isDirtyRef.current) return;

      const target = event.target as Node | null;
      if (!target) return;

      if (panelRef.current?.contains(target)) {
        return;
      }

      window.setTimeout(() => {
        handleSave();
      }, 0);
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener(
        'pointerdown',
        handleOutsidePointerDown,
        true,
      );
    };
  }, [handleSave]);

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
                  Multi-selected: {selectedIds.length} instances
                  {compatiblePinBatchIds.length > 1
                    ? `, pin edits will apply to ${compatiblePinBatchIds.length} compatible instances`
                    : ' (editing active one)'}
                </p>
              )}
            </div>

            <PropertyEditor
              data={draftData}
              onChange={(newData: any) => {
                setDraftData(newData);
                draftDataRef.current = newData;
                setIsDirty(true);
                isDirtyRef.current = true;
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
                draftDataRef.current = newData;
                setIsDirty(true);
                isDirtyRef.current = true;
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
