import { create } from 'zustand';
import { IntentGraph, Instance, Side } from '../types';

const generateId = () => Math.random().toString(36).substr(2, 9);

interface HistoryState {
  past: IntentGraph[];
  future: IntentGraph[];
}

interface IORingState {
  // Data
  graph: IntentGraph;
  selectedId: string | null;
  clipboard: Instance | null;
  
  // History
  history: HistoryState;

  // Actions
  setGraph: (graph: IntentGraph) => void;
  selectInstance: (id: string | null) => void;
  
  updateInstance: (id: string, partial: Partial<Instance>) => void;
  addInstance: (side: Side, type?: string) => void;
  deleteInstance: (id: string) => void;
  
  // Renamed from reorderInstance and enhanced
  moveInstance: (id: string, newSide: Side, newOrder: number) => void;

  copyInstance: (id: string) => void;
  pasteInstance: (targetSide?: Side) => void;
  
  updateRingConfig: (config: Partial<IntentGraph['ring_config']>) => void;

  undo: () => void;
  redo: () => void;
}

const DEFAULT_GRAPH: IntentGraph = {
  ring_config: {
    width: 26,
    height: 12,
    placement_order: 'counterclockwise'
  },
  instances: []
};

export const useIORingStore = create<IORingState>((set, get) => {
  
  const pushHistory = () => {
    set((state) => ({
      history: {
        past: [...state.history.past, state.graph],
        future: []
      }
    }));
  };

  return {
    graph: DEFAULT_GRAPH,
    selectedId: null,
    clipboard: null,
    history: { past: [], future: [] },

    setGraph: (graph) => {
      // Assign IDs if missing
      const processedGraph = {
        ...graph,
        instances: graph.instances.map((inst: Instance) => ({
          ...inst,
          id: inst.id || generateId(),
          meta: inst.meta || {}
        }))
      };
      set({ graph: processedGraph, history: { past: [], future: [] }, selectedId: null });
    },

    selectInstance: (id) => set({ selectedId: id }),

    updateInstance: (id, partial) => {
      pushHistory();
      const { graph } = get();
      
      const newInstances = graph.instances.map((inst: Instance) => {
        if (inst.id !== id) return inst;
        return { ...inst, ...partial };
      });

      set({ graph: { ...graph, instances: newInstances } });
    },

    moveInstance: (id, newSide, newOrder) => {
       pushHistory();
       const { graph } = get();

       const target = graph.instances.find((i: Instance) => i.id === id);
       if (!target) return;

       const oldSide = target.side;

       if (oldSide === newSide) {
           // Same side reorder
           const sideInstances = graph.instances
             .filter((i: Instance) => i.side === oldSide)
             .sort((a: Instance, b: Instance) => a.order - b.order);
           
           const filtered = sideInstances.filter((i: Instance) => i.id !== id);
           
           // Clamp index
           const insertIndex = Math.max(0, Math.min(newOrder, filtered.length));
           filtered.splice(insertIndex, 0, target);
           
           const updatedSideInstances = filtered.map((inst: Instance, index: number) => ({
             ...inst,
             order: index
           }));
    
           const newInstances = graph.instances.map((inst: Instance) => {
             const updated = updatedSideInstances.find((u: Instance) => u.id === inst.id);
             return updated || inst;
           });
    
           set({ graph: { ...graph, instances: newInstances } });
       } else {
           // Move to different side
           // 1. Remove from old side & renumber old side
           const oldSideInstances = graph.instances
               .filter((i: Instance) => i.side === oldSide && i.id !== id)
               .sort((a: Instance, b: Instance) => a.order - b.order)
               .map((inst: Instance, idx: number) => ({ ...inst, order: idx }));

           // 2. Insert into new side & renumber new side
           const newSideInstances = graph.instances
               .filter((i: Instance) => i.side === newSide) // target not here yet
               .sort((a: Instance, b: Instance) => a.order - b.order);
            
           const insertIndex = Math.max(0, Math.min(newOrder, newSideInstances.length));
           
           // Create updated target with new side
           const updatedTarget = { ...target, side: newSide };
           
           newSideInstances.splice(insertIndex, 0, updatedTarget);
           
           const finalNewSideInstances = newSideInstances.map((inst: Instance, idx: number) => ({ 
               ...inst, 
               order: idx 
           }));

           // 3. Construct full list
           const otherInstances = graph.instances.filter((i: Instance) => i.side !== oldSide && i.side !== newSide);
           
           set({ 
               graph: { 
                   ...graph, 
                   instances: [...otherInstances, ...oldSideInstances, ...finalNewSideInstances] 
               } 
           });
       }
    },

    copyInstance: (id) => {
        const { graph } = get();
        const instance = graph.instances.find((i: Instance) => i.id === id);
        if (instance) {
            set({ clipboard: { ...instance } });
        }
    },

    pasteInstance: (targetSide) => {
        const { clipboard, graph } = get();
        if (!clipboard) return;

        pushHistory();
        
        // Determine side
        // If targetSide not provided, default to 'top' or maybe the clipboard's own side?
        // Requirement: "currently selected side, Default 'top'"
        const sideToUse = targetSide || 'top';
        
        // Calculate order: append to end
        const sideInstances = graph.instances.filter((i: Instance) => i.side === sideToUse);
        const maxOrder = sideInstances.length > 0 ? Math.max(...sideInstances.map((i: Instance) => i.order)) : -1;

        const newInstance: Instance = {
            ...clipboard,
            id: generateId(),
            side: sideToUse,
            order: maxOrder + 1
            // Name should probably be unique-ified? Requirement says "Name/Device/Type/Meta copied".
            // If name is strict unique, user might need to rename manually or we append suffix.
            // For now, exact copy as requested.
        };

        set({ 
            graph: { ...graph, instances: [...graph.instances, newInstance] },
            selectedId: newInstance.id
        });
    },

    addInstance: (side, type = 'pad') => {
      pushHistory();
      const { graph, selectedId } = get();

      // Determine target side and insertion point based on selection
      const selectedInstance = selectedId ? graph.instances.find((i: Instance) => i.id === selectedId) : null;
      
      let targetSide = side;
      // We will determine the exact insertion index after fetching the side list

      if (selectedInstance && (selectedInstance.side as string) !== 'corner') {
         // Case 1: Insert after selected instance
         targetSide = selectedInstance.side;
      } 
      // Case 2: Append to specified side (default behavior) -> targetSide stays as 'side' arg

      let namePrefix = 'INST';
      let device = 'GenericeDevice';

      if (type === 'filler') {
        namePrefix = 'FILLER';
        device = 'PFILLER20';
      } else if (type === 'space') {
        namePrefix = 'SPACE';
        device = 'SPACE';
      }

      // Get instances for the target side, sorted by order
      const sideInstances = graph.instances
        .filter((i: Instance) => i.side === targetSide)
        .sort((a: Instance, b: Instance) => a.order - b.order);

      // Determine insertion index
      let insertIndex = sideInstances.length; // Default to append

      if (selectedInstance && selectedInstance.side === targetSide && (selectedInstance.side as string) !== 'corner') {
        const foundIndex = sideInstances.findIndex((i: Instance) => i.id === selectedId);
        if (foundIndex !== -1) {
          insertIndex = foundIndex + 1;
        }
      }

      const newInst: Instance = {
        id: generateId(),
        name: `${namePrefix}_${sideInstances.length + 1}`,
        device: device,
        type: type, 
        side: targetSide,
        order: 0, // Will be set by re-indexing
        meta: {}
      };

      // Insert and re-index
      const newSideList = [...sideInstances];
      newSideList.splice(insertIndex, 0, newInst);
      
      const reindexedSideList = newSideList.map((inst, index) => ({
        ...inst,
        order: index
      }));

      // Construct final graph
      const otherInstances = graph.instances.filter((i: Instance) => i.side !== targetSide);

      set({ 
        graph: { ...graph, instances: [...otherInstances, ...reindexedSideList] }, 
        selectedId: newInst.id 
      });
    },

    deleteInstance: (id) => {
      pushHistory();
      const { graph } = get();

      set({ 
        graph: { ...graph, instances: graph.instances.filter((i: Instance) => i.id !== id) },
        selectedId: null
      });
    },

    updateRingConfig: (config) => {
      pushHistory();
      const { graph } = get();
      set({ graph: { ...graph, ring_config: { ...graph.ring_config, ...config } } });
    },

    undo: () => {
      set((state) => {
        const { past, future } = state.history;
        if (past.length === 0) return state;

        const previous = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);
        
        return {
          graph: previous,
          history: {
            past: newPast,
            future: [state.graph, ...future]
          }
        };
      });
    },

    redo: () => {
      set((state) => {
        const { past, future } = state.history;
        if (future.length === 0) return state;

        const next = future[0];
        const newFuture = future.slice(1);

        return {
          graph: next,
          history: {
            past: [...past, state.graph],
            future: newFuture
          }
        };
      });
    }
  };
});
