import { create } from 'zustand';

import { IntentGraph, Instance, Side } from '../types';
import {
  buildPinConfigTemplate,
  classifyDeviceForProcess,
  getSupportedDevicesForProcess,
  isSupportedDeviceForProcess,
} from '../utils/pinConfigTemplates';

const generateId = () => Math.random().toString(36).substr(2, 9);

type PlacementOrder = 'clockwise' | 'counterclockwise';
type CornerLocation = 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
type AddInstanceType =
  | 'pad'
  | 'corner'
  | 'corner_analog'
  | 'corner_digital'
  | 'filler'
  | 'filler10'
  | 'filler20'
  | 'filler10a'
  | 'filler20a'
  | 'blank'
  | 'space'
  | 'cut';

const DEFAULT_PAD_DEVICE_BY_PROCESS: Record<string, string> = {
  T180: 'PVDD1CDG',
  T28: 'PDDW16SDGZ_V_G',
};

const resolveProcessNodeKey = (processNode?: string): 'T180' | 'T28' =>
  String(processNode || 'T180')
    .toUpperCase()
    .includes('28')
    ? 'T28'
    : 'T180';

const resolveCornerDevice = (
  processNode?: string,
  type: AddInstanceType = 'corner',
): string => {
  const processKey = resolveProcessNodeKey(processNode);
  if (processKey === 'T28') {
    if (type === 'corner_digital') return 'PCORNER_G';
    return 'PCORNERA_G';
  }
  return 'PCORNER';
};

const resolvePeripheralDevice = (
  processNode?: string,
  type: AddInstanceType = 'pad',
): {
  namePrefix: string;
  device: string;
  normalizedType: 'filler' | 'blank';
} | null => {
  const processKey = resolveProcessNodeKey(processNode);

  if (type === 'blank' || type === 'space') {
    return { namePrefix: 'BLANK', device: 'BLANK', normalizedType: 'blank' };
  }

  if (type === 'cut') {
    if (processKey === 'T28') {
      return {
        namePrefix: 'CUT',
        device: 'PRCUTA_G',
        normalizedType: 'filler',
      };
    }
    return { namePrefix: 'CUT', device: 'PFILLER10', normalizedType: 'filler' };
  }

  if (
    type === 'filler' ||
    type === 'filler10' ||
    type === 'filler20' ||
    type === 'filler10a' ||
    type === 'filler20a'
  ) {
    if (processKey === 'T28') {
      const t28FillerMap: Record<string, string> = {
        filler10a: 'PFILLER10A_G',
        filler20a: 'PFILLER20A_G',
        filler10: 'PFILLER10_G',
        filler20: 'PFILLER20_G',
        filler: 'PFILLER20A_G',
      };
      return {
        namePrefix: 'FILLER',
        device: t28FillerMap[type] || t28FillerMap.filler,
        normalizedType: 'filler',
      };
    }

    const t180FillerMap: Record<string, string> = {
      filler10: 'PFILLER10',
      filler20: 'PFILLER20',
      filler: 'PFILLER20',
      filler10a: 'PFILLER10',
      filler20a: 'PFILLER20',
    };
    return {
      namePrefix: 'FILLER',
      device: t180FillerMap[type] || t180FillerMap.filler,
      normalizedType: 'filler',
    };
  }

  return null;
};

const resolvePadWidthFromDevice = (device?: string): number | null => {
  const normalizedDevice = String(device || '').toUpperCase();

  if (normalizedDevice === 'BLANK' || normalizedDevice.includes('RCUT')) {
    return 10;
  }

  const fillerMatch = normalizedDevice.match(/PFILLER(\d+)/);
  if (fillerMatch) {
    const parsed = Number(fillerMatch[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
  }

  return null;
};

const isFillerLike = (inst: Instance): boolean => {
  const compType = String(inst.type || '').toLowerCase();
  const device = String(inst.device || '').toUpperCase();
  return (
    compType === 'filler' ||
    compType === 'blank' ||
    device.includes('FILLER') ||
    device.includes('RCUT') ||
    device === 'BLANK'
  );
};

const hasOwn = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

const isPinConfigRecord = (
  value: unknown,
): value is Record<string, { label?: unknown }> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const normalizePinConfig = (config: unknown): Record<string, string> | null => {
  if (!isPinConfigRecord(config)) {
    return null;
  }

  const normalized: Record<string, string> = {};
  Object.keys(config)
    .sort()
    .forEach(pin => {
      const entry = config[pin];
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        normalized[pin] = String(entry.label ?? '');
      } else {
        normalized[pin] = String(entry ?? '');
      }
    });

  return normalized;
};

const pinConfigsEqual = (left: unknown, right: unknown): boolean => {
  const l = normalizePinConfig(left);
  const r = normalizePinConfig(right);
  if (!l || !r) return false;
  return JSON.stringify(l) === JSON.stringify(r);
};

const buildTemplateForInstance = (
  inst: Instance,
  ringConfig: IntentGraph['ring_config'],
) =>
  buildPinConfigTemplate({
    processNode: ringConfig?.process_node,
    device: inst.device,
    instanceName: inst.name,
    domain: (inst as any).domain,
    pinConfigProfiles: ringConfig?.pin_connection_profiles,
  });

const hasCustomPinConfig = (
  inst: Instance,
  ringConfig: IntentGraph['ring_config'],
): boolean => {
  const current = (inst as any).pin_connection;
  if (!isPinConfigRecord(current)) {
    return false;
  }

  const template = buildTemplateForInstance(inst, ringConfig);
  if (!template) {
    return true;
  }

  return !pinConfigsEqual(current, template);
};

const shouldRebuildPinConfig = (
  previous: Instance,
  partial: Partial<Instance>,
  ringConfig: IntentGraph['ring_config'],
): boolean => {
  if (hasOwn(partial, 'pin_connection')) {
    return false;
  }

  const triggerRebuild =
    hasOwn(partial, 'device') ||
    hasOwn(partial, 'domain') ||
    hasOwn(partial, 'name');

  if (!triggerRebuild) {
    return false;
  }

  if (hasCustomPinConfig(previous, ringConfig)) {
    return false;
  }

  const next = { ...previous, ...partial } as Instance;
  return isSupportedDeviceForProcess(ringConfig?.process_node, next.device);
};

const resolveDefaultPadDevice = (processNode?: string): string => {
  const normalized = String(processNode || 'T180').toUpperCase();
  const preferred = DEFAULT_PAD_DEVICE_BY_PROCESS[normalized];
  const supported = getSupportedDevicesForProcess(normalized);

  if (preferred && supported.includes(preferred)) {
    return preferred;
  }

  if (supported.length > 0) {
    return supported[0];
  }

  return 'GenericeDevice';
};

const toPositiveNumber = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  return fallback;
};

const isPadLikeInstance = (inst: Instance): boolean => {
  const compType = String(inst.type || '').toLowerCase();
  return compType === 'pad';
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
      if (isPadLikeInstance(inst)) {
        counts[inst.side] += 1;
      }
    }
  });

  const width = Math.max(counts.top, counts.bottom, 1);
  const height = Math.max(counts.left, counts.right, 1);

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
      width,
      height,
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
  const existingPinConfig = (inst as any).pin_connection;
  if (!force && existingPinConfig && typeof existingPinConfig === 'object') {
    return inst;
  }

  const generated = buildTemplateForInstance(inst, ringConfig);

  if (!generated) {
    return inst;
  }

  return {
    ...inst,
    pin_connection: generated,
  };
};

interface HistoryState {
  past: IntentGraph[];
  future: IntentGraph[];
}

interface ClipboardPayload {
  instances: Instance[];
  sourceSelectionIds: string[];
}

interface IORingState {
  // Data
  graph: IntentGraph;
  selectedId: string | null;
  selectedIds: string[];
  clipboard: ClipboardPayload | null;
  editorSourcePath: string | null;
  editorProcessNode: string | null;

  // History
  history: HistoryState;

  // Actions
  setGraph: (graph: IntentGraph) => void;
  setEditorSourcePath: (path: string | null) => void;
  setEditorProcessNode: (processNode: string | null) => void;
  selectInstance: (id: string | null, additive?: boolean) => void;
  selectInstances: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;

  updateInstance: (id: string, partial: Partial<Instance>) => void;
  updateInstancesPinConnection: (
    ids: string[],
    pinConnection: Record<string, { label: string }> | undefined,
  ) => void;
  addInstance: (side: Side, type?: string) => void;
  deleteInstance: (id: string) => void;
  deleteInstances: (ids: string[]) => void;

  // Renamed from reorderInstance and enhanced
  moveInstance: (id: string, newSide: Side, newOrder: number) => void;
  moveInstances: (ids: string[], newSide: Side, newOrder: number) => void;
  moveCornerInstance: (id: string, location: CornerLocation) => void;

  copyInstance: (id: string) => void;
  copySelection: (ids?: string[]) => void;
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
    editorProcessNode: null,
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
    setEditorProcessNode: processNode =>
      set({ editorProcessNode: processNode }),

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
        const nextPartial = { ...partial };
        if (hasOwn(partial, 'device') && !hasOwn(partial, 'pad_width')) {
          const nextCandidate = { ...inst, ...partial } as Instance;
          if (isFillerLike(nextCandidate)) {
            const autoWidth = resolvePadWidthFromDevice(nextCandidate.device);
            if (autoWidth !== null) {
              nextPartial.pad_width = autoWidth;
            }
          }
        }

        const forceRebuild = shouldRebuildPinConfig(
          inst,
          nextPartial,
          graph.ring_config,
        );

        return withAutoPinConfig(
          { ...inst, ...nextPartial } as Instance,
          graph.ring_config,
          forceRebuild,
        );
      });

      set({
        graph: withDerivedRingConfig(
          normalizeGraphInstances({ ...graph, instances: newInstances }),
        ),
      });
    },

    updateInstancesPinConnection: (ids, pinConnection) => {
      const targetIds = Array.from(new Set(ids));
      if (targetIds.length === 0) return;

      pushHistory();
      const { graph } = get();
      const targetSet = new Set(targetIds);

      const newInstances = graph.instances.map((inst: Instance) => {
        if (!targetSet.has(inst.id)) return inst;

        const nextMeta = { ...(inst.meta || {}) };
        delete nextMeta.pin_connection;

        const nextInst = {
          ...inst,
          pin_connection: pinConnection,
          meta: nextMeta,
        } as Instance;

        return withAutoPinConfig(nextInst, graph.ring_config);
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

    moveInstances: (ids, newSide, newOrder) => {
      const deduped = Array.from(new Set(ids));
      if (deduped.length === 0) return;

      const { graph } = get();
      const selectedSet = new Set(deduped);
      const movable = graph.instances.filter(inst => selectedSet.has(inst.id));

      if (movable.length === 0) return;

      pushHistory();

      const placementOrder = getPlacementOrder(graph);
      const sideSet: Side[] = ['top', 'right', 'bottom', 'left'];

      const sortedMovable = movable.slice().sort((a, b) => {
        if (a.side === b.side) {
          return Number(a.order || 0) - Number(b.order || 0);
        }

        const sidePriority: Record<Side, number> = {
          top: 0,
          right: 1,
          bottom: 2,
          left: 3,
        };

        return sidePriority[a.side as Side] - sidePriority[b.side as Side];
      });

      const destinationWithoutSelection = getSideVisualInstances(
        graph,
        newSide,
      ).filter(inst => !selectedSet.has(inst.id));

      const insertIndex = Math.max(
        0,
        Math.min(newOrder, destinationWithoutSelection.length),
      );

      const movedWithNewSide = sortedMovable.map(inst => ({
        ...inst,
        side: newSide,
      }));

      const destinationVisual = [...destinationWithoutSelection];
      destinationVisual.splice(insertIndex, 0, ...movedWithNewSide);

      const updatedMap = new Map<string, Instance>();

      sideSet.forEach(side => {
        const visualForSide =
          side === newSide
            ? destinationVisual
            : getSideVisualInstances(graph, side).filter(
                inst => !selectedSet.has(inst.id),
              );

        const updatedSide = applySideOrderFromVisual(
          side,
          visualForSide,
          placementOrder,
        );

        updatedSide.forEach(inst => {
          updatedMap.set(inst.id, inst);
        });
      });

      set({
        graph: withDerivedRingConfig(
          normalizeGraphInstances({
            ...graph,
            instances: graph.instances.map(
              inst => updatedMap.get(inst.id) || inst,
            ),
          }),
        ),
        selectedId: deduped[deduped.length - 1] || null,
        selectedIds: deduped,
      });
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
        set({
          clipboard: {
            instances: [{ ...instance, meta: { ...(instance.meta || {}) } }],
            sourceSelectionIds: [id],
          },
        });
      }
    },

    copySelection: ids => {
      const { graph, selectedIds, selectedId } = get();
      const requested = ids && ids.length > 0 ? ids : selectedIds;
      const fallback =
        requested.length > 0 ? requested : selectedId ? [selectedId] : [];
      if (fallback.length === 0) return;

      const byId = new Map(graph.instances.map(inst => [inst.id, inst]));
      const copiedInstances = fallback
        .map(id => byId.get(id))
        .filter((inst): inst is Instance => !!inst)
        .map(inst => ({ ...inst, meta: { ...(inst.meta || {}) } }));

      if (copiedInstances.length === 0) {
        return;
      }

      set({
        clipboard: {
          instances: copiedInstances,
          sourceSelectionIds: fallback,
        },
      });
    },

    pasteInstance: targetSide => {
      const { clipboard, graph, selectedId } = get();
      if (!clipboard || clipboard.instances.length === 0) return;

      const selectedInstance = selectedId
        ? graph.instances.find((inst: Instance) => inst.id === selectedId)
        : null;

      const clipboardCorners = clipboard.instances.filter(
        inst =>
          (inst.side as string) === 'corner' ||
          String(inst.type || '').toLowerCase() === 'corner' ||
          String(inst.device || '')
            .toUpperCase()
            .includes('CORNER'),
      );
      const clipboardLinear = clipboard.instances.filter(
        inst => !clipboardCorners.some(cornerInst => cornerInst.id === inst.id),
      );

      if (clipboardCorners.length === 0 && clipboardLinear.length === 0) {
        return;
      }

      pushHistory();

      let workingGraph = graph;
      const pastedIds: string[] = [];

      const sideToUse =
        targetSide ||
        ((selectedInstance && (selectedInstance.side as string) !== 'corner'
          ? selectedInstance.side
          : clipboardLinear[0]?.side || 'top') as Side);

      if (clipboardLinear.length > 0) {
        const sideInstances = getSideVisualInstances(workingGraph, sideToUse);

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

        const newInstances: Instance[] = clipboardLinear.map(inst => ({
          ...inst,
          id: generateId(),
          side: sideToUse,
          order: 1,
          meta: { ...(inst.meta || {}) },
        }));

        const newVisual = [...sideInstances];
        newVisual.splice(insertIndex, 0, ...newInstances);
        const placementOrder = getPlacementOrder(workingGraph);
        const updatedSide = applySideOrderFromVisual(
          sideToUse,
          newVisual,
          placementOrder,
        );
        const updatedMap = new Map(updatedSide.map(i => [i.id, i]));

        workingGraph = {
          ...workingGraph,
          instances: [...workingGraph.instances, ...newInstances].map(
            inst => updatedMap.get(inst.id) || inst,
          ),
        };

        pastedIds.push(...newInstances.map(inst => inst.id));
      }

      clipboardCorners.forEach(cornerClipboard => {
        const emptyLocation = getFirstEmptyCornerLocation(workingGraph);
        if (!emptyLocation) {
          return;
        }

        const cornerInstance: Instance = withCornerLocation(
          {
            ...cornerClipboard,
            id: generateId(),
            type: 'corner',
            device: cornerClipboard.device || 'PCORNER',
            order: 1,
            meta: { ...(cornerClipboard.meta || {}) },
          } as Instance,
          emptyLocation,
        );

        workingGraph = {
          ...workingGraph,
          instances: [...workingGraph.instances, cornerInstance],
        };
        pastedIds.push(cornerInstance.id);
      });

      if (pastedIds.length === 0) {
        return;
      }

      set({
        graph: withDerivedRingConfig(normalizeGraphInstances(workingGraph)),
        selectedId: pastedIds[pastedIds.length - 1] || null,
        selectedIds: pastedIds,
      });
    },

    addInstance: (side, type = 'pad') => {
      pushHistory();
      const { graph, selectedId } = get();
      const requestedType = String(
        type || 'pad',
      ).toLowerCase() as AddInstanceType;

      if (
        requestedType === 'corner' ||
        requestedType === 'corner_analog' ||
        requestedType === 'corner_digital'
      ) {
        const cornerLocation = getFirstEmptyCornerLocation(graph);
        if (!cornerLocation) {
          return;
        }

        const cornerDevice = resolveCornerDevice(
          graph.ring_config?.process_node,
          requestedType,
        );

        const cornerInst: Instance = withCornerLocation(
          {
            id: generateId(),
            name: `CORNER_${cornerLocation}`,
            device: cornerDevice,
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
      let device = resolveDefaultPadDevice(graph.ring_config?.process_node);
      let normalizedType = requestedType;
      const businessDefaults: Partial<Instance> = {};

      const peripheralConfig = resolvePeripheralDevice(
        graph.ring_config?.process_node,
        requestedType,
      );

      if (peripheralConfig) {
        namePrefix = peripheralConfig.namePrefix;
        device = peripheralConfig.device;
        normalizedType = peripheralConfig.normalizedType;
      } else {
        const processNode = String(
          graph.ring_config?.process_node || 'T180',
        ).toUpperCase();
        const deviceClass = classifyDeviceForProcess(
          graph.ring_config?.process_node,
          device,
        );

        if (processNode === 'T180') {
          // T180 keeps domain user-editable; this is only initial default filling.
          businessDefaults.domain =
            deviceClass === 'analog' ? 'analog' : 'digital';
        }

        if (deviceClass === 'digital') {
          businessDefaults.direction = 'input';
        }
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
        type: normalizedType,
        side: targetSide,
        order: 1, // Will be set by re-indexing
        meta: {},
        ...businessDefaults,
      };

      if (isFillerLike(newInst)) {
        const autoWidth = resolvePadWidthFromDevice(newInst.device);
        if (autoWidth !== null) {
          newInst.pad_width = autoWidth;
        }
      }

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
