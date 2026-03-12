import React, {
  useRef,
  useState,
  useMemo,
  useEffect,
  useCallback,
} from 'react';

import clsx from 'clsx';

import { useIORingStore } from '../store/useIORingStore';
import { Instance, Side } from '../types';

type PlacementOrder = 'clockwise' | 'counterclockwise';

// Default Visual constants (Fallback if metadata missing)
const DEFAULT_SCALE = 0.6;
const FALLBACK_PAD_W = 80;
const FALLBACK_PAD_H = 120;
const FALLBACK_FILLER_W = 10;
const FALLBACK_FILLER10_W = 10;
const FALLBACK_CORNER_SIZE = 130;
const PADDING = 40;

const DEFAULT_CANVAS_WIDTH = 1200;
const DEFAULT_CANVAS_HEIGHT = 720;
const MIN_RING_SPAN = 10; // Minimum span for empty sides
const MIN_VIEW_SCALE = 0.25;
const MAX_VIEW_SCALE = 8;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const LEFT_GUTTER = 20;
const RIGHT_GUTTER = 12;

const T28_DEVICE_COLORS: Record<string, string> = {
  PDB3AC: '#4A90E2',
  PDB3AC_H_G: '#4A90E2',
  PDB3AC_V_G: '#4A90E2',
  PVDD1AC: '#5BA0F2',
  PVDD1AC_H_G: '#5BA0F2',
  PVDD1AC_V_G: '#5BA0F2',
  PVSS1AC: '#3A80D2',
  PVSS1AC_H_G: '#3A80D2',
  PVSS1AC_V_G: '#3A80D2',
  PVDD3AC: '#87CEEB',
  PVDD3AC_H_G: '#87CEEB',
  PVDD3AC_V_G: '#87CEEB',
  PVSS3AC: '#4682B4',
  PVSS3AC_H_G: '#4682B4',
  PVSS3AC_V_G: '#4682B4',
  PVDD3A: '#7EC8E3',
  PVDD3A_H_G: '#7EC8E3',
  PVDD3A_V_G: '#7EC8E3',
  PVSS3A: '#3E7AB0',
  PVSS3A_H_G: '#3E7AB0',
  PVSS3A_V_G: '#3E7AB0',
  PDDW16SDGZ: '#32CD32',
  PDDW16SDGZ_H_G: '#32CD32',
  PDDW16SDGZ_V_G: '#32CD32',
  PVDD1DGZ: '#90EE90',
  PVDD1DGZ_H_G: '#90EE90',
  PVDD1DGZ_V_G: '#90EE90',
  PVDD2POC: '#90EE90',
  PVDD2POC_H_G: '#90EE90',
  PVDD2POC_V_G: '#90EE90',
  PVSS1DGZ: '#228B22',
  PVSS1DGZ_H_G: '#228B22',
  PVSS1DGZ_V_G: '#228B22',
  PVSS2DGZ: '#228B22',
  PVSS2DGZ_H_G: '#228B22',
  PVSS2DGZ_V_G: '#228B22',
  PCORNERA_G: '#FF6B6B',
  PCORNER_G: '#FF8888',
  PFILLER10A_G: '#D8D8D8',
  PFILLER20A_G: '#D8D8D8',
  PFILLER10_G: '#C0C0C0',
  PFILLER20_G: '#C0C0C0',
  PRCUTA_G: '#A0A0A0',
};

const T180_DEVICE_COLORS: Record<string, string> = {
  PAD70LU_TRL: '#FFD700',
  PVDD1CDG: '#32CD32',
  PVSS1CDG: '#228B22',
  PVDD2CDG: '#90EE90',
  PVSS2CDG: '#228B22',
  PVDD1ANA: '#4A90E2',
  PVSS1ANA: '#3A80D2',
  PVDD2ANA: '#5BA0F2',
  PVSS2ANA: '#3A80D2',
  PCORNER: '#FF6B6B',
  PFILLER10: '#C0C0C0',
  PFILLER20: '#C0C0C0',
  blank: '#FF0000',
};

type LegendGroup = {
  title: string;
  items: Array<{ label: string; color: string }>;
};

const T28_LEGEND_GROUPS: LegendGroup[] = [
  {
    title: 'Analog IO (Blue)',
    items: [
      { label: 'PDB3AC', color: '#4A90E2' },
      { label: 'PVDD1AC', color: '#5BA0F2' },
      { label: 'PVSS1AC', color: '#3A80D2' },
      { label: 'PVDD3AC', color: '#87CEEB' },
      { label: 'PVSS3AC', color: '#4682B4' },
      { label: 'PVDD3A', color: '#7EC8E3' },
      { label: 'PVSS3A', color: '#3E7AB0' },
    ],
  },
  {
    title: 'Digital IO (Green)',
    items: [
      { label: 'PDDW16SDGZ', color: '#32CD32' },
      { label: 'PVDD1DGZ', color: '#90EE90' },
      { label: 'PVDD2POC', color: '#90EE90' },
      { label: 'PVSS1DGZ', color: '#228B22' },
      { label: 'PVSS2DGZ', color: '#228B22' },
    ],
  },
  {
    title: 'Corners / Fillers',
    items: [
      { label: 'PCORNERA_G', color: '#FF6B6B' },
      { label: 'PCORNER_G', color: '#FF8888' },
      { label: 'PFILLER10A_G', color: '#D8D8D8' },
      { label: 'PFILLER20A_G', color: '#D8D8D8' },
      { label: 'PFILLER10_G', color: '#C0C0C0' },
      { label: 'PFILLER20_G', color: '#C0C0C0' },
      { label: 'PRCUTA_G', color: '#A0A0A0' },
    ],
  },
];

const T180_LEGEND_GROUPS: LegendGroup[] = [
  {
    title: 'Digital IO (Green)',
    items: [
      { label: 'PVDD1CDG', color: '#32CD32' },
      { label: 'PVSS1CDG', color: '#228B22' },
      { label: 'PVDD2CDG', color: '#90EE90' },
      { label: 'PVSS2CDG', color: '#228B22' },
    ],
  },
  {
    title: 'Analog IO (Blue)',
    items: [
      { label: 'PVDD1ANA', color: '#4A90E2' },
      { label: 'PVSS1ANA', color: '#3A80D2' },
      { label: 'PVDD2ANA', color: '#5BA0F2' },
      { label: 'PVSS2ANA', color: '#3A80D2' },
    ],
  },
  {
    title: 'Corners / Fillers',
    items: [
      { label: 'PCORNER', color: '#FF6B6B' },
      { label: 'PFILLER10', color: '#C0C0C0' },
      { label: 'PFILLER20', color: '#C0C0C0' },
      { label: 'blank', color: '#FF0000' },
    ],
  },
];

export const RingCanvas: React.FC = () => {
  const {
    graph,
    selectInstance,
    selectInstances,
    clearSelection,
    selectedId,
    selectedIds,
    moveInstance,
    moveInstances,
    moveCornerInstance,
    copyInstance,
    copySelection,
    pasteInstance,
    deleteInstances,
  } = useIORingStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({
    width: DEFAULT_CANVAS_WIDTH,
    height: DEFAULT_CANVAS_HEIGHT,
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingSelectionIds, setDraggingSelectionIds] = useState<string[]>(
    [],
  );
  const [viewScale, setViewScale] = useState(1);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    additive: boolean;
  } | null>(null);
  const [panState, setPanState] = useState<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const placementOrder: PlacementOrder =
    String(graph?.ring_config?.placement_order || 'counterclockwise') ===
    'clockwise'
      ? 'clockwise'
      : 'counterclockwise';

  const shouldReverseVisual = useCallback(
    (side: Side) => {
      if (placementOrder === 'clockwise') {
        return side === 'bottom' || side === 'left';
      }
      return side === 'top' || side === 'right';
    },
    [placementOrder],
  );

  // Extract Visual Metadata
  const metadata = (graph.visual_metadata || {
    colors: {},
    dimensions: {},
  }) as any;
  const dims = metadata.dimensions || {};
  const ringProcessNode = String(
    graph?.ring_config?.process_node || '',
  ).toUpperCase();
  const isT28Node = ringProcessNode.includes('28');
  const isT180Node = ringProcessNode.includes('180') || !isT28Node;

  const ringPadW = Number(graph?.ring_config?.pad_width || 0);
  const ringPadH = Number(graph?.ring_config?.pad_height || 0);
  const ringCorner = Number(graph?.ring_config?.corner_size || 0);

  const PAD_W_DEFAULT =
    ringPadW > 0 ? ringPadW : isT28Node ? 20 : FALLBACK_PAD_W;
  const PAD_H_DEFAULT =
    ringPadH > 0 ? ringPadH : isT28Node ? 110 : FALLBACK_PAD_H;
  const CORNER_DEFAULT =
    ringCorner > 0 ? ringCorner : isT28Node ? 110 : FALLBACK_CORNER_SIZE;
  const FILLER_DEFAULT = isT28Node ? PAD_W_DEFAULT : FALLBACK_FILLER_W;

  // Calculate scaled dimensions based on metadata or fallback
  const FILLER_W_LOGICAL =
    (dims.filler_width || FILLER_DEFAULT) * DEFAULT_SCALE;
  const FILLER10_W_LOGICAL =
    (dims.filler_10_width || FALLBACK_FILLER10_W) * DEFAULT_SCALE;
  const CORNER_SIZE_VISUAL =
    (dims.corner_size || CORNER_DEFAULT) * DEFAULT_SCALE;

  const inferFillerWidth = useCallback(
    (inst: Instance) => {
      const isBlankType =
        String(inst.type || '').toLowerCase() === 'blank' ||
        String(inst.device || '').toUpperCase() === 'BLANK';

      const explicit = Number(
        isBlankType ? inst.pad_width || 0 : inst.pad_width || 0,
      );
      if (Number.isFinite(explicit) && explicit > 0) {
        return explicit * DEFAULT_SCALE;
      }

      if (isBlankType) {
        return FILLER10_W_LOGICAL;
      }

      const dev = String(inst.device || '').toUpperCase();
      if (dev.includes('RCUT')) {
        return FILLER_W_LOGICAL;
      }
      const match = dev.match(/PFILLER(\d+)/);
      if (match) {
        const v = Number(match[1]);
        if (Number.isFinite(v) && v > 0) {
          if (v === 10) return FILLER10_W_LOGICAL;
          return v * DEFAULT_SCALE;
        }
      }

      return FILLER_W_LOGICAL;
    },
    [FILLER10_W_LOGICAL, FILLER_W_LOGICAL],
  );

  const getDeviceCategory = (inst: Instance) => {
    const type = String(inst.type || '').toLowerCase();
    const device = String(inst.device || '').toUpperCase();

    if (type === 'blank' || device === 'BLANK') return 'blank';
    if (type === 'corner' || device.includes('CORNER')) return 'corner';
    if (
      type === 'filler' ||
      device.includes('FILLER') ||
      device.includes('RCUT')
    ) {
      return 'filler';
    }
    if (type === 'inner_pad') return 'inner_pad';
    return 'io';
  };

  const getColor = (inst: Instance) => {
    const device = String(inst.device || '');
    const upperDevice = device.toUpperCase();
    const category = getDeviceCategory(inst);

    if (category === 'blank') {
      return 'transparent';
    }

    if (isT28Node) {
      if (T28_DEVICE_COLORS[upperDevice]) {
        return T28_DEVICE_COLORS[upperDevice];
      }

      const t28Prefix = Object.entries(T28_DEVICE_COLORS).find(([key]) =>
        upperDevice.startsWith(key),
      );
      if (t28Prefix) {
        return t28Prefix[1];
      }
    }

    if (isT180Node) {
      if (T180_DEVICE_COLORS[upperDevice]) {
        return T180_DEVICE_COLORS[upperDevice];
      }

      const t180Prefix = Object.entries(T180_DEVICE_COLORS).find(([key]) =>
        upperDevice.startsWith(key.toUpperCase()),
      );
      if (t180Prefix) {
        return t180Prefix[1];
      }
    }

    if (metadata.colors?.[device]) {
      return metadata.colors[device];
    }

    if (metadata.colors?.[upperDevice]) {
      return metadata.colors[upperDevice];
    }

    if (upperDevice.includes('CORNER') || upperDevice === 'PCORNER') {
      return '#FF6B6B';
    }

    if (upperDevice.includes('FILLER') || upperDevice.includes('RCUT')) {
      return '#C0C0C0';
    }

    const isDigital =
      upperDevice.includes('CDG') || upperDevice.includes('PDDW');
    const isAnalog = upperDevice.includes('ANA');
    const isPower = upperDevice.includes('PVDD');
    const isGround = upperDevice.includes('PVSS');

    if (isDigital && isPower) {
      return '#90EE90';
    }
    if (isDigital && isGround) {
      return '#228B22';
    }
    if (isAnalog && isPower) {
      return '#5BA0F2';
    }
    if (isAnalog && isGround) {
      return '#3A80D2';
    }
    if (isDigital) {
      return '#32CD32';
    }
    if (isAnalog) {
      return '#4A90E2';
    }

    return metadata.colors?.default || '#CCCCCC';
  };

  const legendGroups = useMemo(
    () => (isT28Node ? T28_LEGEND_GROUPS : T180_LEGEND_GROUPS),
    [isT28Node],
  );

  const getInstanceThickness = useCallback(
    (inst: Instance) => {
      const category = getDeviceCategory(inst);
      if (category === 'corner') {
        const corner = Number(
          inst.pad_height ||
            inst.pad_width ||
            dims.corner_size ||
            CORNER_DEFAULT,
        );
        return corner * DEFAULT_SCALE;
      }
      if (category === 'filler' || category === 'blank') {
        const fillerH = Number(
          inst.pad_height || dims.pad_height || PAD_H_DEFAULT,
        );
        return fillerH * DEFAULT_SCALE;
      }
      const padH = Number(inst.pad_height || dims.pad_height || PAD_H_DEFAULT);
      return padH * DEFAULT_SCALE;
    },
    [CORNER_DEFAULT, PAD_H_DEFAULT, dims.corner_size, dims.pad_height],
  );

  // Helper: Get visual width along the perimeter for an instance
  const getInstanceWidth = useCallback(
    (inst: Instance) => {
      const category = getDeviceCategory(inst);
      if (category === 'corner') {
        const corner = Number(
          inst.pad_width || dims.corner_size || CORNER_DEFAULT,
        );
        return corner * DEFAULT_SCALE;
      }
      if (
        category === 'filler' ||
        category === 'blank' ||
        inst.type === 'space'
      ) {
        return inferFillerWidth(inst);
      }
      const padW = Number(inst.pad_width || dims.pad_width || PAD_W_DEFAULT);
      return padW * DEFAULT_SCALE;
    },
    [
      CORNER_DEFAULT,
      PAD_W_DEFAULT,
      dims.corner_size,
      dims.pad_width,
      inferFillerWidth,
    ],
  );

  const getTextRotation = (side: Side) => {
    if (side === 'top' || side === 'bottom') return 90;
    return 0;
  };

  const getInstanceLabel = (inst: Instance) => {
    const category = getDeviceCategory(inst);
    if (category === 'blank') return '';
    if (category === 'corner' || category === 'filler') {
      return inst.device || inst.name || 'UNKNOWN';
    }

    let signalName = inst.name || '';
    if (category === 'inner_pad') {
      signalName = signalName.replace(/^inner_pad_/, '');
      signalName = signalName.replace(/_(left|right|top|bottom)_\d+_\d+$/, '');
    } else {
      signalName = signalName.replace(/_(left|right|top|bottom)_\d+$/, '');
    }
    return `${signalName}:${inst.device || 'UNKNOWN'}`;
  };

  const blurActiveEditorField = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active) return;

    if (
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT' ||
      active.isContentEditable
    ) {
      active.blur();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if input/textarea is focused, unless it is the canvas itself (which doesn't focus really)
      // Actually, we want global hotkeys, but not when typing in a property field.
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      ) {
        return;
      }

      // Copy: Ctrl+C
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (selectedIds.length > 0) {
          copySelection(selectedIds);
        } else if (selectedId) {
          copyInstance(selectedId);
        }
      }
      // Paste: Ctrl+V
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        let targetSide: Side = 'top';
        if (selectedId) {
          const inst = graph.instances.find(
            (i: Instance) => i.id === selectedId,
          );
          if (inst && (inst.side as any) !== 'corner') targetSide = inst.side;
        }
        pasteInstance(targetSide);
      }
      // Delete: Delete
      if (e.key === 'Delete') {
        if (selectedIds.length > 0) {
          deleteInstances(selectedIds);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedId,
    selectedIds,
    graph,
    copyInstance,
    copySelection,
    pasteInstance,
    deleteInstances,
  ]);

  // Group instances
  const { sides, corners } = useMemo(() => {
    const s: Record<Side, Instance[]> = {
      top: [],
      right: [],
      bottom: [],
      left: [],
    };
    const c: Record<string, Instance | null> = {
      top_left: null,
      top_right: null,
      bottom_left: null,
      bottom_right: null,
    };

    graph.instances.forEach((inst: Instance) => {
      if ((inst.side as any) === 'corner') {
        // Use location if available (from backend), else infer
        const loc = inst.meta?.location || inst.meta?._original_position || '';
        if (loc.includes('top_left')) c.top_left = inst;
        else if (loc.includes('top_right')) c.top_right = inst;
        else if (loc.includes('bottom_left')) c.bottom_left = inst;
        else if (loc.includes('bottom_right')) c.bottom_right = inst;
      } else if (s[inst.side]) {
        s[inst.side].push(inst);
      }
    });

    Object.keys(s).forEach(k => {
      const side = k as Side;
      s[side].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
      if (shouldReverseVisual(side)) {
        s[side] = s[side].slice().reverse();
      }
    });

    return { sides: s, corners: c };
  }, [graph.instances, shouldReverseVisual]);

  // --- Dynamic Layout Calculation ---

  // Calculate cumulative length for each side
  const sideLengths = useMemo(() => {
    const lens: Record<Side, number> = { top: 0, right: 0, bottom: 0, left: 0 };
    Object.keys(sides).forEach(key => {
      const side = key as Side;
      lens[side] = sides[side].reduce(
        (acc, inst) => acc + getInstanceWidth(inst),
        0,
      );
    });
    return lens;
  }, [sides, getInstanceWidth]);

  // Calculate Ring Dims (Inner Span)
  const ringInnerWidth = Math.max(
    sideLengths.top,
    sideLengths.bottom,
    MIN_RING_SPAN,
  );
  const ringInnerHeight = Math.max(
    sideLengths.left,
    sideLengths.right,
    MIN_RING_SPAN,
  );

  // Calculate Visual Boundaries centered
  const visualW = ringInnerWidth + CORNER_SIZE_VISUAL * 2;
  const visualH = ringInnerHeight + CORNER_SIZE_VISUAL * 2;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateViewport = () => {
      const rect = container.getBoundingClientRect();
      setViewport({
        width: Math.max(320, rect.width),
        height: Math.max(320, rect.height),
      });
    };

    updateViewport();

    const observer = new ResizeObserver(updateViewport);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  const viewportInnerW = Math.max(
    320,
    viewport.width - LEFT_GUTTER - RIGHT_GUTTER,
  );
  const viewportInnerH = Math.max(320, viewport.height);

  const contentW = visualW + PADDING * 2;

  const canvasW = Math.max(contentW, viewportInnerW);
  const canvasH = viewportInnerH;

  const cx = canvasW / 2;
  const cy = canvasH / 2;

  // structure bounding box
  const structLeft = cx - visualW / 2;
  const structTop = cy - visualH / 2;
  const structRight = cx + visualW / 2;
  const structBottom = cy + visualH / 2;

  // Pad Position Helper
  const getPos = useCallback(
    (side: Side, index: number, instances: Instance[]) => {
      // Simplified getPos ensuring we return Top-Left X/Y and W/H for the rect
      let x = 0,
        y = 0,
        w = 0,
        h = 0;

      // Width along the perimeter
      const pWidth = getInstanceWidth(instances[index]);

      // Current Offset: sum of widths of all instances BEFORE this index
      const preInstances = instances.slice(0, index);
      const offset = preInstances.reduce(
        (acc, i) => acc + getInstanceWidth(i),
        0,
      );

      if (side === 'top') {
        // Render Top: Pads have width=pWidth, height=PAD_H
        // Origin: Top-Left of Chip Structure?
        // Let's align them starting from LEFT + Corner to RIGHT.
        // X = structLeft + Corner + Offset
        // Y = structTop (or adjusted to center on ring thickness)

        w = pWidth;
        h = getInstanceThickness(instances[index]);
        x = structLeft + CORNER_SIZE_VISUAL + offset;
        y = structTop; // Align Top edge of ring
      } else if (side === 'bottom') {
        // Render Bottom: Left to Right
        w = pWidth;
        h = getInstanceThickness(instances[index]);
        x = structLeft + CORNER_SIZE_VISUAL + offset;
        y = structBottom - h; // Align Bottom edge (inner)
      } else if (side === 'right') {
        // Render Right: Top to Bottom?
        // Start Y = structTop + Corner + Offset
        // Check order: If backend Right is Bottom->Top, we should reverse visually?
        // Let's assume standard visual flow Top->Bottom for now.

        w = getInstanceThickness(instances[index]); // Width is thickness
        h = pWidth; // Height is perimeter width

        x = structRight - w; // Align Right edge (inner)
        y = structTop + CORNER_SIZE_VISUAL + offset;
      } else if (side === 'left') {
        // Render Left: Top to Bottom
        w = getInstanceThickness(instances[index]);
        h = pWidth;

        x = structLeft;
        y = structTop + CORNER_SIZE_VISUAL + offset;
      }

      return { x, y, w, h, rotation: 0 };
    },
    [
      getInstanceWidth,
      getInstanceThickness,
      structLeft,
      structTop,
      structRight,
      structBottom,
      CORNER_SIZE_VISUAL,
    ],
  );

  const instanceBounds = useMemo(() => {
    const bounds = new Map<
      string,
      { x: number; y: number; w: number; h: number; side: Side | 'corner' }
    >();

    Object.entries(sides).forEach(([, instances]) => {
      instances.forEach((inst, idx) => {
        const { x, y, w, h } = getPos(inst.side as Side, idx, instances);
        bounds.set(inst.id, { x, y, w, h, side: inst.side as Side });
      });
    });

    if (corners.top_left) {
      bounds.set(corners.top_left.id, {
        x: structLeft,
        y: structTop,
        w: CORNER_SIZE_VISUAL,
        h: CORNER_SIZE_VISUAL,
        side: 'corner',
      });
    }
    if (corners.top_right) {
      bounds.set(corners.top_right.id, {
        x: structRight - CORNER_SIZE_VISUAL,
        y: structTop,
        w: CORNER_SIZE_VISUAL,
        h: CORNER_SIZE_VISUAL,
        side: 'corner',
      });
    }
    if (corners.bottom_right) {
      bounds.set(corners.bottom_right.id, {
        x: structRight - CORNER_SIZE_VISUAL,
        y: structBottom - CORNER_SIZE_VISUAL,
        w: CORNER_SIZE_VISUAL,
        h: CORNER_SIZE_VISUAL,
        side: 'corner',
      });
    }
    if (corners.bottom_left) {
      bounds.set(corners.bottom_left.id, {
        x: structLeft,
        y: structBottom - CORNER_SIZE_VISUAL,
        w: CORNER_SIZE_VISUAL,
        h: CORNER_SIZE_VISUAL,
        side: 'corner',
      });
    }

    return bounds;
  }, [
    sides,
    corners,
    structLeft,
    structTop,
    structRight,
    structBottom,
    CORNER_SIZE_VISUAL,
    getPos,
  ]);

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current) {
        return { x: 0, y: 0 };
      }
      const ctm = svgRef.current.getScreenCTM();
      if (!ctm) {
        return { x: 0, y: 0 };
      }

      const sx = (clientX - ctm.e) / ctm.a;
      const sy = (clientY - ctm.f) / ctm.d;

      return {
        x: (sx - viewOffset.x) / viewScale,
        y: (sy - viewOffset.y) / viewScale,
      };
    },
    [viewOffset.x, viewOffset.y, viewScale],
  );

  // --- Render ---

  // Calculate Corner Positions
  const cornTL_x = structLeft;
  const cornTL_y = structTop;
  const cornTR_x = structRight - CORNER_SIZE_VISUAL;
  const cornTR_y = structTop;
  const cornBR_x = structRight - CORNER_SIZE_VISUAL;
  const cornBR_y = structBottom - CORNER_SIZE_VISUAL;
  const cornBL_x = structLeft;
  const cornBL_y = structBottom - CORNER_SIZE_VISUAL;

  const DrawCorner = ({
    inst,
    x,
    y,
  }: {
    inst: Instance | null;
    x: number;
    y: number;
  }) => {
    if (!inst) {
      return (
        <rect
          x={x}
          y={y}
          width={CORNER_SIZE_VISUAL}
          height={CORNER_SIZE_VISUAL}
          fill="#eee"
          stroke="#ccc"
          strokeDasharray="4"
          rx="4"
        />
      );
    }
    const color = getColor(inst);
    const isSelected = selectedIds.includes(inst.id);

    return (
      <g
        onMouseDown={e => {
          if (e.button !== 0) return;
          blurActiveEditorField();
          e.preventDefault();
          e.stopPropagation();
          const additive = e.ctrlKey || e.metaKey;
          selectInstance(inst.id, additive);
          if (!additive) {
            setDraggingId(inst.id);
            setDraggingSelectionIds([inst.id]);
          }
        }}
        onClick={e => {
          e.stopPropagation();
        }}
        className="cursor-pointer hover:opacity-90"
      >
        <rect
          x={x}
          y={y}
          width={CORNER_SIZE_VISUAL}
          height={CORNER_SIZE_VISUAL}
          fill={color}
          stroke={isSelected ? 'blue' : 'black'}
          strokeWidth={isSelected ? 3 : 2}
        />
        <text
          x={x + CORNER_SIZE_VISUAL / 2}
          y={y + CORNER_SIZE_VISUAL / 2}
          textAnchor="middle"
          dy=".3em"
          fontSize="8"
          fontWeight="bold"
        >
          {inst.device || 'PCORNER'}
        </text>
      </g>
    );
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (panState) {
      const dx = e.clientX - panState.startX;
      const dy = e.clientY - panState.startY;
      setViewOffset({
        x: panState.originX + dx,
        y: panState.originY + dy,
      });
      return;
    }

    if (selectionBox) {
      const world = screenToWorld(e.clientX, e.clientY);
      setSelectionBox(prev =>
        prev
          ? {
              ...prev,
              endX: world.x,
              endY: world.y,
            }
          : prev,
      );
      return;
    }

    if (!draggingId || !svgRef.current) return;
    const instance = graph.instances.find(i => i.id === draggingId);
    if (!instance) return;

    const activeDragIds =
      draggingSelectionIds.length > 0 &&
      draggingSelectionIds.includes(draggingId)
        ? draggingSelectionIds
        : [draggingId];

    const world = screenToWorld(e.clientX, e.clientY);
    const mx = world.x;
    const my = world.y;

    if ((instance.side as any) === 'corner') {
      const cornerAnchors = [
        {
          location: 'top_left' as const,
          x: cornTL_x + CORNER_SIZE_VISUAL / 2,
          y: cornTL_y + CORNER_SIZE_VISUAL / 2,
        },
        {
          location: 'top_right' as const,
          x: cornTR_x + CORNER_SIZE_VISUAL / 2,
          y: cornTR_y + CORNER_SIZE_VISUAL / 2,
        },
        {
          location: 'bottom_right' as const,
          x: cornBR_x + CORNER_SIZE_VISUAL / 2,
          y: cornBR_y + CORNER_SIZE_VISUAL / 2,
        },
        {
          location: 'bottom_left' as const,
          x: cornBL_x + CORNER_SIZE_VISUAL / 2,
          y: cornBL_y + CORNER_SIZE_VISUAL / 2,
        },
      ];

      let nearest = cornerAnchors[0];
      let nearestDist =
        (mx - nearest.x) * (mx - nearest.x) +
        (my - nearest.y) * (my - nearest.y);

      for (let i = 1; i < cornerAnchors.length; i++) {
        const anchor = cornerAnchors[i];
        const dist =
          (mx - anchor.x) * (mx - anchor.x) + (my - anchor.y) * (my - anchor.y);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = anchor;
        }
      }

      moveCornerInstance(instance.id, nearest.location);
      return;
    }

    const yTop = structTop + CORNER_SIZE_VISUAL / 2;
    const yBottom = structBottom - CORNER_SIZE_VISUAL / 2;
    const xLeft = structLeft + CORNER_SIZE_VISUAL / 2;
    const xRight = structRight - CORNER_SIZE_VISUAL / 2;

    const distTop = Math.abs(my - yTop);
    const distRight = Math.abs(mx - xRight);
    const distBottom = Math.abs(my - yBottom);
    const distLeft = Math.abs(mx - xLeft);

    let closestSide: Side = 'top';
    let minDist = distTop;
    if (distRight < minDist) {
      minDist = distRight;
      closestSide = 'right';
    }
    if (distBottom < minDist) {
      minDist = distBottom;
      closestSide = 'bottom';
    }
    if (distLeft < minDist) {
      closestSide = 'left';
    }

    const sideInsts = sides[closestSide];
    const dragSet = new Set(activeDragIds);
    const filteredSideInsts = sideInsts.filter(inst => !dragSet.has(inst.id));

    let trackPos = 0;
    if (closestSide === 'top' || closestSide === 'bottom') {
      const start = structLeft + CORNER_SIZE_VISUAL;
      trackPos = mx - start;
    } else {
      const start = structTop + CORNER_SIZE_VISUAL;
      trackPos = my - start;
    }
    if (trackPos < 0) trackPos = 0;

    let newIndex = filteredSideInsts.length;
    let cumulative = 0;
    for (let i = 0; i < filteredSideInsts.length; i++) {
      const width = getInstanceWidth(filteredSideInsts[i]);
      if (trackPos < cumulative + width / 2) {
        newIndex = i;
        break;
      }
      cumulative += width;
    }

    const oldSide = instance.side as Side;
    const oldIndex = sideInsts.findIndex(inst => inst.id === draggingId);
    const isGroupDrag = activeDragIds.length > 1;

    if (closestSide !== oldSide || newIndex !== oldIndex) {
      if (isGroupDrag) {
        moveInstances(activeDragIds, closestSide, newIndex);
      } else {
        moveInstance(instance.id, closestSide, newIndex);
      }
    }
  };

  const handleMouseUp = () => {
    if (selectionBox) {
      const minX = Math.min(selectionBox.startX, selectionBox.endX);
      const maxX = Math.max(selectionBox.startX, selectionBox.endX);
      const minY = Math.min(selectionBox.startY, selectionBox.endY);
      const maxY = Math.max(selectionBox.startY, selectionBox.endY);

      const width = maxX - minX;
      const height = maxY - minY;

      if (width < 2 || height < 2) {
        if (!selectionBox.additive) {
          clearSelection();
        }
      } else {
        const ids = Array.from(instanceBounds.entries())
          .filter(([, b]) => {
            const bx2 = b.x + b.w;
            const by2 = b.y + b.h;
            return !(bx2 < minX || b.x > maxX || by2 < minY || b.y > maxY);
          })
          .map(([id]) => id);

        selectInstances(ids, selectionBox.additive);
      }

      setSelectionBox(null);
    }

    setPanState(null);
    setDraggingId(null);
    setDraggingSelectionIds([]);
  };

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;

      e.preventDefault();
      const ctm = svgRef.current.getScreenCTM();
      if (!ctm) return;

      const sx = (e.clientX - ctm.e) / ctm.a;
      const sy = (e.clientY - ctm.f) / ctm.d;

      const worldX = (sx - viewOffset.x) / viewScale;
      const worldY = (sy - viewOffset.y) / viewScale;

      const zoomFactor = Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY);
      const nextScale = Math.max(
        MIN_VIEW_SCALE,
        Math.min(MAX_VIEW_SCALE, viewScale * zoomFactor),
      );

      if (Math.abs(nextScale - viewScale) < 1e-6) {
        return;
      }

      const nextOffset = {
        x: sx - worldX * nextScale,
        y: sy - worldY * nextScale,
      };

      setViewScale(nextScale);
      setViewOffset(nextOffset);
    },
    [viewOffset.x, viewOffset.y, viewScale],
  );

  return (
    <div
      ref={containerRef}
      className="flex-1 min-w-0 min-h-0 bg-gray-50 flex items-stretch justify-start overflow-hidden pl-5 pr-3 py-0 relative"
    >
      <svg
        ref={svgRef}
        width={canvasW}
        height={canvasH}
        className="bg-white shadow-xl rounded-lg select-none"
        onMouseDown={e => {
          if (e.target === e.currentTarget) {
            blurActiveEditorField();
            if (e.button === 1) {
              e.preventDefault();
              setPanState({
                startX: e.clientX,
                startY: e.clientY,
                originX: viewOffset.x,
                originY: viewOffset.y,
              });
              return;
            }

            if (e.button !== 0) {
              return;
            }

            const world = screenToWorld(e.clientX, e.clientY);
            setSelectionBox({
              startX: world.x,
              startY: world.y,
              endX: world.x,
              endY: world.y,
              additive: e.ctrlKey || e.metaKey,
            });
          }
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        style={{
          minWidth: canvasW,
          minHeight: canvasH,
          cursor: panState ? 'grabbing' : draggingId ? 'grabbing' : 'crosshair',
        }}
      >
        <defs>
          <pattern
            id="grid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="gray"
              strokeWidth="0.5"
              strokeOpacity="0.1"
            />
          </pattern>
        </defs>
        <g
          transform={`translate(${viewOffset.x}, ${viewOffset.y}) scale(${viewScale})`}
        >
          <rect
            width="100%"
            height="100%"
            fill="url(#grid)"
            pointerEvents="none"
          />

          <DrawCorner inst={corners.top_left} x={cornTL_x} y={cornTL_y} />
          <DrawCorner inst={corners.top_right} x={cornTR_x} y={cornTR_y} />
          <DrawCorner inst={corners.bottom_right} x={cornBR_x} y={cornBR_y} />
          <DrawCorner inst={corners.bottom_left} x={cornBL_x} y={cornBL_y} />

          {Object.entries(sides).map(([sideName, instances]) => (
            <g key={sideName}>
              {instances.map((inst, idx) => {
                const { x, y, w, h } = getPos(
                  inst.side as Side,
                  idx,
                  instances,
                );

                const isSelected = selectedIds.includes(inst.id);
                const color = getColor(inst);
                const category = getDeviceCategory(inst);

                const isSpace = inst.type === 'space';
                const isBlank = category === 'blank';
                const label = getInstanceLabel(inst);
                const textRotation = getTextRotation(inst.side as Side);

                const strokeColor = isSelected
                  ? 'blue'
                  : isSpace
                  ? '#ccc'
                  : 'black';
                const strokeWidth = isSelected ? 3 : 2;
                const strokeDash = isSpace || isBlank ? '4 2' : undefined;
                const baseFontSize =
                  category === 'corner'
                    ? 8
                    : category === 'filler' || category === 'blank'
                    ? 6
                    : 7;
                const t28BaseFontSize =
                  category === 'corner'
                    ? 6
                    : category === 'filler' || category === 'blank'
                    ? 4.5
                    : 5.5;
                const maxByShape = Math.max(4, Math.min(w, h) * 0.42);
                const fontSize = Math.max(
                  4,
                  Math.min(
                    isT28Node ? t28BaseFontSize : baseFontSize,
                    maxByShape,
                  ),
                );

                return (
                  <g
                    key={inst.id}
                    transform={`translate(${x}, ${y})`}
                    onClick={e => {
                      e.stopPropagation();
                    }}
                    onMouseDown={e => {
                      if (e.button !== 0) return;
                      blurActiveEditorField();
                      e.preventDefault();
                      e.stopPropagation();
                      const additive = e.ctrlKey || e.metaKey;
                      const hasCurrentSelection = selectedIds.includes(inst.id);
                      const dragIds = hasCurrentSelection
                        ? selectedIds
                        : [inst.id];
                      selectInstance(inst.id, additive);
                      if (!additive) {
                        setDraggingId(inst.id);
                        setDraggingSelectionIds(dragIds);
                      }
                    }}
                    className={clsx(
                      'cursor-pointer',
                      draggingId === inst.id && 'opacity-70',
                    )}
                  >
                    <rect
                      width={w}
                      height={h}
                      fill={color}
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={strokeDash}
                      fillOpacity={category === 'blank' ? 0 : 0.8}
                      className="transition-colors"
                    />

                    {!isSpace && !isBlank && (
                      <g
                        transform={`translate(${w / 2}, ${
                          h / 2
                        }) rotate(${textRotation})`}
                      >
                        <text
                          textAnchor="middle"
                          dy=".3em"
                          className="font-mono pointer-events-none select-none"
                          style={{
                            fontSize: `${fontSize}px`,
                            fill: '#111827',
                            stroke: 'rgba(255, 255, 255, 0.92)',
                            strokeWidth: 0.9,
                            paintOrder: 'stroke fill',
                            textRendering: 'geometricPrecision',
                            fontWeight: 600,
                          }}
                        >
                          {label}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          ))}

          {selectionBox && (
            <rect
              x={Math.min(selectionBox.startX, selectionBox.endX)}
              y={Math.min(selectionBox.startY, selectionBox.endY)}
              width={Math.abs(selectionBox.endX - selectionBox.startX)}
              height={Math.abs(selectionBox.endY - selectionBox.startY)}
              fill="rgba(59,130,246,0.12)"
              stroke="#3B82F6"
              strokeDasharray="4 3"
              strokeWidth={1}
              pointerEvents="none"
            />
          )}
        </g>
      </svg>

      <div className="absolute top-3 right-3 w-64 max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-lg border border-gray-200 bg-white/95 shadow-lg p-3">
        <div className="text-xs font-semibold text-gray-700 mb-2">
          Color Legend ({isT28Node ? 'T28' : 'T180'})
        </div>
        <div className="space-y-3">
          {legendGroups.map(group => (
            <div key={group.title}>
              <div className="text-[11px] font-medium text-gray-600 mb-1">
                {group.title}
              </div>
              <div className="space-y-1">
                {group.items.map(item => (
                  <div
                    key={`${group.title}-${item.label}`}
                    className="flex items-center gap-2"
                  >
                    <span
                      className="inline-block w-3 h-3 rounded-sm border border-gray-400"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-[11px] text-gray-700 font-mono leading-tight">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
