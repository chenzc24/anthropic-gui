import React from 'react';

import { useIORingStore } from '../store/useIORingStore';
import { Instance } from '../types';

import { PropertyEditor } from './PropertyEditor';

export const InspectorPanel: React.FC = () => {
  const { graph, selectedId, selectedIds, updateInstance, updateRingConfig } =
    useIORingStore();

  const selectedInstance = selectedId
    ? graph.instances.find((i: Instance) => i.id === selectedId)
    : null;

  return (
    <div className="w-80 border-r bg-white flex flex-col h-full min-h-0 shrink-0 overflow-hidden">
      <div className="p-4 bg-gray-50 border-b font-medium text-gray-800">
        Inspector
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
              data={selectedInstance}
              onChange={(newData: any) =>
                updateInstance(selectedInstance.id, newData)
              }
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
              data={graph.ring_config}
              onChange={(newData: any) => updateRingConfig(newData)}
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
