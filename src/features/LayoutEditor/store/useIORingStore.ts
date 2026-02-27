import { create } from 'zustand';

import { IntentGraph, Instance, Side } from '../types';
import { buildPinConfigTemplate } from '../utils/pinConfigTemplates';

const generateId = () => Math.random().toString(36).substr(2, 9);

type PlacementOrder = 'clockwise' | 'counterclockwise';
type CornerLocation = 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';

const toPositiveNumber = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  return fallback;
};

const inferPerimeterWidth = (
  inst: Instance,
  ringConfig: IntentGraph['ring_config'],
): number => {
  const compType = String(inst.type || '').toLowerCase();
  const device = String(inst.device || '').toUpperCase();

  if (compType === 'corner' || device.includes('CORNER')) {
    return toPositiveNumber(
      inst.pad_width ?? inst.pad_height ?? ringConfig.corner_size,
      130,
    );
  }

  if (
    compType === 'filler' ||
    compType === 'blank' ||
    device.includes('FILLER') ||
    device.includes('RCUT') ||
    device === 'BLANK'
  ) {
    const explicit = toPositiveNumber(inst.pad_width, NaN);
    if (Number.isFinite(explicit)) {
      return explicit;
    }

    const fillerMatch = device.match(/PFILLER(\d+)/);
    if (fillerMatch) {
      return toPositiveNumber(fillerMatch[1], 10);
    }

    if (device === 'BLANK') {
      return 10;
    }

    return 10;
  }

  return toPositiveNumber(inst.pad_width ?? ringConfig.pad_width, 80);
};

const resolveCornerLocation = (inst: Instance): CornerLocation | null => {
  const location =
    inst.meta?.location ||
    inst.meta?._relative_position ||
    inst.meta?._original_position;

  if (
    location === 'top_left' ||
    location === 'top_right' ||
    location === 'bottom_left' ||
    location === 'bottom_right'
  ) {
    return location;
  }

  return null;
};

const withCornerLocation = (
  inst: Instance,
  location: CornerLocation,
): Instance => ({
  ...inst,
  side: 'corner' as Side,
  meta: {
    ...(inst.meta || {}),
    location,
    _relative_position: location,
    _original_position: location,
  },
});

const getFirstEmptyCornerLocation = (
  graph: IntentGraph,
): CornerLocation | null => {
  const occupied = new Set<CornerLocation>();
  graph.instances.forEach(inst => {
    if ((inst.side as string) !== 'corner') return;
    const loc = resolveCornerLocation(inst);
    if (loc) {
      occupied.add(loc);
    }
  });

  const ordered: CornerLocation[] = [
    'top_left',
    'top_right',
    'bottom_right',
    'bottom_left',
  ];
  return ordered.find(loc => !occupied.has(loc)) || null;
};

const withAutoChipSize = (graph: IntentGraph): IntentGraph => {
  if (!graph || !Array.isArray(graph.instances)) {
    return graph;
  }

  const sideSum: Record<Side, number> = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  };

  const corners: Record<string, Instance | null> = {
    top_left: null,
    top_right: null,
    bottom_left: null,
    bottom_right: null,
  };

  graph.instances.forEach(inst => {
    const side = String(inst.side || '');
    if (side === 'corner') {
      const loc = resolveCornerLocation(inst);
      if (loc) {
        corners[loc] = inst;
      }
      return;
    }

    if (
      side === 'top' ||
      side === 'right' ||
      side === 'bottom' ||
      side === 'left'
    ) {
      sideSum[side] += inferPerimeterWidth(inst, graph.ring_config);
    }
  });

  const defaultCorner = toPositiveNumber(graph.ring_config.corner_size, 130);
  const cornerLen = (corner: Instance | null): number =>
    corner ? inferPerimeterWidth(corner, graph.ring_config) : defaultCorner;

  const topTotal =
    sideSum.top + cornerLen(corners.top_left) + cornerLen(corners.top_right);
  const bottomTotal =
    sideSum.bottom +
    cornerLen(corners.bottom_left) +
    cornerLen(corners.bottom_right);
  const leftTotal =
    sideSum.left + cornerLen(corners.top_left) + cornerLen(corners.bottom_left);
  const rightTotal =
    sideSum.right +
    cornerLen(corners.top_right) +
    cornerLen(corners.bottom_right);

  return {
    ...graph,
    ring_config: {
      ...graph.ring_config,
      chip_width: Math.max(topTotal, bottomTotal),
      chip_height: Math.max(leftTotal, rightTotal),
    },
  };
};

const withAutoSideCounts = (graph: IntentGraph): IntentGraph => {
  if (!graph || !Array.isArray(graph.instances)) {
    return graph;
  }

  const counts: Record<Side, number> = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  };

  graph.instances.forEach(inst => {
    if (
      inst.side === 'top' ||
      inst.side === 'right' ||
      inst.side === 'bottom' ||
      inst.side === 'left'
    ) {
      counts[inst.side] += 1;
    }
  });

  const ringConfig = graph.ring_config || ({} as IntentGraph['ring_config']);
  const hasPatternA =
    ringConfig.top_count !== undefined ||
    ringConfig.right_count !== undefined ||
    ringConfig.bottom_count !== undefined ||
    ringConfig.left_count !== undefined;
  const hasPatternB =
    ringConfig.num_pads_top !== undefined ||
    ringConfig.num_pads_right !== undefined ||
    ringConfig.num_pads_bottom !== undefined ||
    ringConfig.num_pads_left !== undefined;

  const usePatternA = hasPatternA || !hasPatternB;

  return {
    ...graph,
    ring_config: {
      ...ringConfig,
      ...(usePatternA
        ? {
            top_count: counts.top,
            right_count: counts.right,
            bottom_count: counts.bottom,
            left_count: counts.left,
          }
        : {}),
      ...(hasPatternB
        ? {
            num_pads_top: counts.top,
            num_pads_right: counts.right,
            num_pads_bottom: counts.bottom,
            num_pads_left: counts.left,
          }
        : {}),
    },
  };
};

const withDerivedRingConfig = (graph: IntentGraph): IntentGraph =>
  withAutoSideCounts(withAutoChipSize(graph));

const getPlacementOrder = (graph: IntentGraph): PlacementOrder =>
  String(graph?.ring_config?.placement_order || 'counterclockwise') ===
  'clockwise'
    ? 'clockwise'
    : 'counterclockwise';

const shouldReverseVisual = (
  side: Side,
  placementOrder: PlacementOrder,
): boolean => {
  if (placementOrder === 'clockwise') {
    return side === 'bottom' || side === 'left';
  }
  return side === 'top' || side === 'right';
};

const buildRelativePosition = (inst: Instance): string | null => {
  if ((inst.side as string) === 'corner') {
    const location =
      inst.meta?.location ||
      inst.meta?._relative_position ||
      inst.meta?._original_position;
    if (
      location === 'top_left' ||
      location === 'top_right' ||
      location === 'bottom_left' ||
      location === 'bottom_right'
    ) {
      return location;
    }
    return null;
  }

  if (
    (inst.side === 'top' ||
      inst.side === 'right' ||
      inst.side === 'bottom' ||
      inst.side === 'left') &&
    Number.isFinite(inst.order)
  ) {
    return `${inst.side}_${Math.max(0, Number(inst.order) - 1)}`;
  }
  return null;
};

const applySideOrderFromVisual = (
  side: Side,
  visualInstances: Instance[],
  placementOrder: PlacementOrder,
): Instance[] => {
  const reversed = shouldReverseVisual(side, placementOrder);
  const total = visualInstances.length;

  return visualInstances.map((inst, visualIndex) => {
    const order = reversed ? total - visualIndex : visualIndex + 1;
    const updated = {
      ...inst,
      side,
      order,
      meta: { ...(inst.meta || {}) },
    };
    const relPos = buildRelativePosition(updated);
    if (relPos) {
      updated.meta._relative_position = relPos;
    }
    return updated;
  });
};

const getSideVisualInstances = (graph: IntentGraph, side: Side): Instance[] => {
  const placementOrder = getPlacementOrder(graph);
  const sorted = graph.instances
    .filter(i => i.side === side)
    .slice()
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  if (shouldReverseVisual(side, placementOrder)) {
    return sorted.slice().reverse();
  }
  return sorted;
};

const normalizeGraphInstances = (graph: IntentGraph): IntentGraph => {
  const placementOrder = getPlacementOrder(graph);
  const sideSet: Side[] = ['top', 'right', 'bottom', 'left'];
  const byId = new Map<string, Instance>();

  sideSet.forEach(side => {
    const visual = getSideVisualInstances(graph, side);
    applySideOrderFromVisual(side, visual, placementOrder).forEach(inst => {
      byId.set(inst.id, inst);
    });
  });

  const normalizedInstances = graph.instances.map(inst => {
    const side = inst.side as string;
    if (side === 'corner') {
      const updated = { ...inst, meta: { ...(inst.meta || {}) } };
      const relPos = buildRelativePosition(updated);
      if (relPos) {
        updated.meta._relative_position = relPos;
      }
      return updated;
    }
    return byId.get(inst.id) || inst;
  });

  return {
    ...graph,
    instances: normalizedInstances,
  };
};

const withAutoPinConfig = (
  inst: Instance,
  ringConfig: IntentGraph['ring_config'],
  force = false,
): Instance => {
  const existingPinConfig = inst.meta?.pin_config ?? (inst as any).pin_config;
  if (!force && existingPinConfig && typeof existingPinConfig === 'object') {
    return inst;
  }

  const generated = buildPinConfigTemplate({
    processNode: ringConfig?.process_node,
    device: inst.device,
    instanceName: inst.name,
    domain: (inst as any).domain ?? inst.meta?.domain,
    pinConfigProfiles: ringConfig?.pin_config_profiles,
  });

  if (!generated) {
    return inst;
  }

  return {
    ...inst,
    meta: {
      ...(inst.meta || {}),
      pin_config: generated,
    },
  };
};

interface HistoryState {
  past: IntentGraph[];
  future: IntentGraph[];
}

interface IORingState {
  // Data
  graph: IntentGraph;
  selectedId: string | null;
  selectedIds: string[];
  clipboard: Instance | null;
  editorSourcePath: string | null;

  // History
  history: HistoryState;

  // Actions
  setGraph: (graph: IntentGraph) => void;
  setEditorSourcePath: (path: string | null) => void;
  selectInstance: (id: string | null, additive?: boolean) => void;
  selectInstances: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;

  updateInstance: (id: string, partial: Partial<Instance>) => void;
  addInstance: (side: Side, type?: string) => void;
  deleteInstance: (id: string) => void;
  deleteInstances: (ids: string[]) => void;

  // Renamed from reorderInstance and enhanced
  moveInstance: (id: string, newSide: Side, newOrder: number) => void;
  moveCornerInstance: (id: string, location: CornerLocation) => void;

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
    placement_order: 'counterclockwise',
    process_node: 'T180',
  },
  instances: [],
};

export const useIORingStore = create<IORingState>((set, get) => {
  const pushHistory = () => {
    set(state => ({
      history: {
        past: [...state.history.past, state.graph],
        future: [],
      },
    }));
  };

  return {
    graph: DEFAULT_GRAPH,
    selectedId: null,
    selectedIds: [],
    clipboard: null,
    editorSourcePath: null,
    history: { past: [], future: [] },

    setGraph: graph => {
      // Assign IDs if missing
      const processedGraph = withDerivedRingConfig(
        normalizeGraphInstances({
          ...graph,
          instances: graph.instances.map((inst: Instance) => ({
            ...withAutoPinConfig(
              {
                ...inst,
                meta: inst.meta || {},
              } as Instance,
              graph.ring_config,
            ),
            id: inst.id || generateId(),
          })),
        }),
      );
      set({
        graph: processedGraph,
        history: { past: [], future: [] },
        selectedId: null,
        selectedIds: [],
      });
    },

    setEditorSourcePath: path => set({ editorSourcePath: path }),

    selectInstance: (id, additive = false) =>
      set(state => {
        if (!id) {
          return { selectedId: null, selectedIds: [] };
        }

        if (!additive) {
          return { selectedId: id, selectedIds: [id] };
        }

        const exists = state.selectedIds.includes(id);
        const nextSelectedIds = exists
          ? state.selectedIds.filter(item => item !== id)
          : [...state.selectedIds, id];

        return {
          selectedId: nextSelectedIds.length
            ? nextSelectedIds[nextSelectedIds.length - 1]
            : null,
          selectedIds: nextSelectedIds,
        };
      }),

    selectInstances: (ids, additive = false) =>
      set(state => {
        const deduped = Array.from(new Set(ids));
        const nextSelectedIds = additive
          ? Array.from(new Set([...state.selectedIds, ...deduped]))
          : deduped;

        return {
          selectedId: nextSelectedIds.length
            ? nextSelectedIds[nextSelectedIds.length - 1]
            : null,
          selectedIds: nextSelectedIds,
        };
      }),

    clearSelection: () => set({ selectedId: null, selectedIds: [] }),

    updateInstance: (id, partial) => {
      pushHistory();
      const { graph } = get();

      const newInstances = graph.instances.map((inst: Instance) => {
        if (inst.id !== id) return inst;
        return withAutoPinConfig(
          { ...inst, ...partial } as Instance,
          graph.ring_config,
        );
      });

      set({
        graph: withDerivedRingConfig(
          normalizeGraphInstances({ ...graph, instances: newInstances }),
        ),
      });
    },

    moveInstance: (id, newSide, newOrder) => {
      pushHistory();
      const { graph } = get();
      const placementOrder = getPlacementOrder(graph);

      const target = graph.instances.find((i: Instance) => i.id === id);
      if (!target) return;

      const oldSide = target.side;
      if (
        oldSide !== 'top' &&
        oldSide !== 'right' &&
        oldSide !== 'bottom' &&
        oldSide !== 'left'
      ) {
        return;
      }

      if (oldSide === newSide) {
        const visualSideInstances = getSideVisualInstances(graph, oldSide);
        const filtered = visualSideInstances.filter(i => i.id !== id);
        const insertIndex = Math.max(0, Math.min(newOrder, filtered.length));
        filtered.splice(insertIndex, 0, { ...target, side: newSide });

        const updatedSideInstances = applySideOrderFromVisual(
          oldSide,
          filtered,
          placementOrder,
        );
        const updatedMap = new Map(updatedSideInstances.map(i => [i.id, i]));

        const newGraph = {
          ...graph,
          instances: graph.instances.map(
            inst => updatedMap.get(inst.id) || inst,
          ),
        };
        set({
          graph: withDerivedRingConfig(normalizeGraphInstances(newGraph)),
        });
      } else {
        const oldVisual = getSideVisualInstances(graph, oldSide).filter(
          i => i.id !== id,
        );
        const newVisual = getSideVisualInstances(graph, newSide);

        const insertIndex = Math.max(0, Math.min(newOrder, newVisual.length));
        newVisual.splice(insertIndex, 0, { ...target, side: newSide });

        const updatedOld = applySideOrderFromVisual(
          oldSide,
          oldVisual,
          placementOrder,
        );
        const updatedNew = applySideOrderFromVisual(
          newSide,
          newVisual,
          placementOrder,
        );

        const updatedMap = new Map<string, Instance>();
        updatedOld.forEach(inst => updatedMap.set(inst.id, inst));
        updatedNew.forEach(inst => updatedMap.set(inst.id, inst));

        const newGraph = {
          ...graph,
          instances: graph.instances.map(
            inst => updatedMap.get(inst.id) || inst,
          ),
        };
        set({
          graph: withDerivedRingConfig(normalizeGraphInstances(newGraph)),
        });
      }
    },

    moveCornerInstance: (id, location) => {
      pushHistory();
      const { graph } = get();

      const target = graph.instances.find((inst: Instance) => inst.id === id);
      if (!target || (target.side as string) !== 'corner') return;

      const currentLocation = resolveCornerLocation(target);
      if (currentLocation === location) return;

      const occupant = graph.instances.find((inst: Instance) => {
        if (inst.id === id || (inst.side as string) !== 'corner') return false;
        return resolveCornerLocation(inst) === location;
      });

      const swapLocation =
        currentLocation || getFirstEmptyCornerLocation(graph) || null;

      if (occupant && !swapLocation) {
        return;
      }

      const newInstances = graph.instances.map((inst: Instance) => {
        if (inst.id === id) {
          return withCornerLocation(inst, location);
        }
        if (occupant && inst.id === occupant.id && swapLocation) {
          return withCornerLocation(inst, swapLocation);
        }
        return inst;
      });

      set({
        graph: withDerivedRingConfig(
          normalizeGraphInstances({ ...graph, instances: newInstances }),
        ),
      });
    },

    copyInstance: id => {
      const { graph } = get();
      const instance = graph.instances.find((i: Instance) => i.id === id);
      if (instance) {
        set({ clipboard: { ...instance } });
      }
    },

    pasteInstance: targetSide => {
      const { clipboard, graph, selectedId } = get();
      if (!clipboard) return;

      pushHistory();

      const selectedInstance = selectedId
        ? graph.instances.find((inst: Instance) => inst.id === selectedId)
        : null;

      const clipboardIsCorner =
        (clipboard.side as string) === 'corner' ||
        String(clipboard.type || '').toLowerCase() === 'corner' ||
        String(clipboard.device || '')
          .toUpperCase()
          .includes('CORNER');

      if (clipboardIsCorner) {
        const emptyLocation = getFirstEmptyCornerLocation(graph);
        if (!emptyLocation) {
          return;
        }

        const cornerInstance: Instance = withCornerLocation(
          {
            ...clipboard,
            id: generateId(),
            type: 'corner',
            device: clipboard.device || 'PCORNER',
            order: 1,
            meta: { ...(clipboard.meta || {}) },
          } as Instance,
          emptyLocation,
        );

        set({
          graph: withDerivedRingConfig(
            normalizeGraphInstances({
              ...graph,
              instances: [...graph.instances, cornerInstance],
            }),
          ),
          selectedId: cornerInstance.id,
          selectedIds: [cornerInstance.id],
        });
        return;
      }

      const sideToUse =
        targetSide ||
        ((selectedInstance && (selectedInstance.side as string) !== 'corner'
          ? selectedInstance.side
          : clipboard.side || 'top') as Side);

      const sideInstances = getSideVisualInstances(graph, sideToUse);

      let insertIndex = sideInstances.length;
      if (
        selectedInstance &&
        selectedInstance.side === sideToUse &&
        (selectedInstance.side as string) !== 'corner'
      ) {
        const selectedIndex = sideInstances.findIndex(
          inst => inst.id === selectedInstance.id,
        );
        if (selectedIndex >= 0) {
          insertIndex = selectedIndex + 1;
        }
      }

      const newInstance: Instance = {
        ...clipboard,
        id: generateId(),
        side: sideToUse,
        order: 1,
        meta: { ...(clipboard.meta || {}) },
      };

      const newVisual = [...sideInstances];
      newVisual.splice(insertIndex, 0, newInstance);
      const placementOrder = getPlacementOrder(graph);
      const updatedSide = applySideOrderFromVisual(
        sideToUse,
        newVisual,
        placementOrder,
      );
      const updatedMap = new Map(updatedSide.map(i => [i.id, i]));

      set({
        graph: withDerivedRingConfig(
          normalizeGraphInstances({
            ...graph,
            instances: [...graph.instances, newInstance].map(
              inst => updatedMap.get(inst.id) || inst,
            ),
          }),
        ),
        selectedId: newInstance.id,
        selectedIds: [newInstance.id],
      });
    },

    addInstance: (side, type = 'pad') => {
      pushHistory();
      const { graph, selectedId } = get();

      if (type === 'corner') {
        const cornerLocation = getFirstEmptyCornerLocation(graph);
        if (!cornerLocation) {
          return;
        }

        const cornerInst: Instance = withCornerLocation(
          {
            id: generateId(),
            name: `CORNER_${cornerLocation}`,
            device: 'PCORNER',
            type: 'corner',
            side: 'corner' as Side,
            order: 1,
            meta: {},
          },
          cornerLocation,
        );

        set({
          graph: withDerivedRingConfig(
            normalizeGraphInstances({
              ...graph,
              instances: [...graph.instances, cornerInst],
            }),
          ),
          selectedId: cornerInst.id,
          selectedIds: [cornerInst.id],
        });
        return;
      }

      // Determine target side and insertion point based on selection
      const selectedInstance = selectedId
        ? graph.instances.find((i: Instance) => i.id === selectedId)
        : null;

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
      } else if (type === 'blank' || type === 'space') {
        namePrefix = 'BLANK';
        device = 'BLANK';
      }

      // Get instances for the target side, sorted by order
      const sideInstances = getSideVisualInstances(graph, targetSide);

      // Determine insertion index
      let insertIndex = sideInstances.length; // Default to append

      if (
        selectedInstance &&
        selectedInstance.side === targetSide &&
        (selectedInstance.side as string) !== 'corner'
      ) {
        const foundIndex = sideInstances.findIndex(
          (i: Instance) => i.id === selectedId,
        );
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
        order: 1, // Will be set by re-indexing
        meta: {},
      };

      const newInstWithPinConfig = withAutoPinConfig(
        newInst,
        graph.ring_config,
        true,
      );

      // Insert and re-index
      const newSideList = [...sideInstances];
      newSideList.splice(insertIndex, 0, newInstWithPinConfig);

      const placementOrder = getPlacementOrder(graph);
      const reindexedSideList = applySideOrderFromVisual(
        targetSide,
        newSideList,
        placementOrder,
      );

      // Construct final graph
      const otherInstances = graph.instances.filter(
        (i: Instance) => i.side !== targetSide,
      );

      set({
        graph: withDerivedRingConfig(
          normalizeGraphInstances({
            ...graph,
            instances: [...otherInstances, ...reindexedSideList],
          }),
        ),
        selectedId: newInstWithPinConfig.id,
        selectedIds: [newInstWithPinConfig.id],
      });
    },

    deleteInstance: id => {
      pushHistory();
      const { graph } = get();

      set({
        graph: withDerivedRingConfig(
          normalizeGraphInstances({
            ...graph,
            instances: graph.instances.filter((i: Instance) => i.id !== id),
          }),
        ),
        selectedId: null,
        selectedIds: [],
      });
    },

    deleteInstances: ids => {
      if (!ids.length) return;
      pushHistory();
      const { graph } = get();
      const deleteSet = new Set(ids);

      set({
        graph: withDerivedRingConfig(
          normalizeGraphInstances({
            ...graph,
            instances: graph.instances.filter(
              (inst: Instance) => !deleteSet.has(inst.id),
            ),
          }),
        ),
        selectedId: null,
        selectedIds: [],
      });
    },

    updateRingConfig: config => {
      pushHistory();
      const { graph } = get();
      set({
        graph: withDerivedRingConfig({
          ...graph,
          ring_config: { ...graph.ring_config, ...config },
        }),
      });
    },

    undo: () => {
      set(state => {
        const { past, future } = state.history;
        if (past.length === 0) return state;

        const previous = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);

        return {
          graph: previous,
          history: {
            past: newPast,
            future: [state.graph, ...future],
          },
        };
      });
    },

    redo: () => {
      set(state => {
        const { past, future } = state.history;
        if (future.length === 0) return state;

        const next = future[0];
        const newFuture = future.slice(1);

        return {
          graph: next,
          history: {
            past: [...past, state.graph],
            future: newFuture,
          },
        };
      });
    },
  };
});
