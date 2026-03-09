import { IntentGraph, Instance, Side } from '../types';

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

interface ExternalInstance {
  name: string;
  device: string;
  type: string;
  side?: string;
  order?: number;
  position?: string | [number, number]; // Legacy string or new [x,y] coordinates
  [key: string]: any;
}

const RUNTIME_META_KEYS = [
  'location',
  '_relative_position',
  '_original_position',
  'position',
];

const BUSINESS_KEYS = [
  'view_name',
  'domain',
  'pad_width',
  'pad_height',
  'pin_connection',
  'direction',
  'voltage_domain',
  'orientation',
];

/**
 * Parses external JSON format into internal GUI format.
 * Supports both Legacy (position strings) and New (side/order + visual_metadata) formats.
 */
export const importAdapter = (json: any): IntentGraph => {
  // Determine source of instances: prefer layout_data, fallback to instances
  const sourceInstances: ExternalInstance[] =
    json.layout_data || json.instances || [];

  const processedInstances: Instance[] = sourceInstances.map(extInst => {
    // Destructure properties to handle different formats
    const {
      position,
      name,
      device,
      type,
      side,
      order,
      id: rawId,
      meta: rawMeta,
      ...rest
    } = extInst;

    const normalizedMeta =
      rawMeta && typeof rawMeta === 'object'
        ? { ...(rawMeta as Record<string, any>) }
        : {};

    const runtimeMeta: Record<string, any> = {};
    RUNTIME_META_KEYS.forEach(key => {
      if (normalizedMeta[key] !== undefined) {
        runtimeMeta[key] = normalizedMeta[key];
      }
    });

    const migratedBusinessFields: Record<string, any> = {};
    BUSINESS_KEYS.forEach(key => {
      if (rest[key] === undefined && normalizedMeta[key] !== undefined) {
        migratedBusinessFields[key] = normalizedMeta[key];
      }
    });

    let finalSide: Side | 'corner';
    let finalOrder = 0;

    // Check if new format (explicit side/order)
    if (side && order !== undefined) {
      finalSide = side as Side | 'corner';
      const numericOrder = Number(order);
      finalOrder = Number.isFinite(numericOrder)
        ? Math.max(1, numericOrder)
        : 1;
    } else if (typeof position === 'string') {
      // Legacy: Regex parse position string
      const ioMatch = position.match(/^(top|bottom|left|right)_(\d+)$/);
      const cornerMatch = position.match(/^(top|bottom)_(left|right)$/);

      if (ioMatch) {
        finalSide = ioMatch[1] as Side;
        finalOrder = parseInt(ioMatch[2], 10) + 1;
      } else if (cornerMatch) {
        finalSide = 'corner';
        // eslint-disable-next-line @typescript-eslint/dot-notation
        runtimeMeta['_original_position'] = position;
      } else {
        const instanceLabel = String(name || device || rawId || 'unknown');
        throw new Error(
          `Invalid position format for instance '${instanceLabel}': '${position}'. ` +
            "Expected 'top_N/right_N/bottom_N/left_N' or corner token.",
        );
      }
    } else {
      const instanceLabel = String(name || device || rawId || 'unknown');
      throw new Error(
        `Missing position for instance '${instanceLabel}'. ` +
          'Expected explicit side+order or relative position string.',
      );
    }

    // Ensure ID exists
    const id = rawId || generateId();

    return {
      id,
      name: name || `Inst_${id}`,
      device: device || 'UNKNOWN',
      type: type || 'unknown',
      side: finalSide as Side, // Cast to satisfy type system
      order: finalOrder,
      ...migratedBusinessFields,
      ...rest,
      meta: {
        ...runtimeMeta,
        // If it was a legacy corner, we might have added _original_position here
        // Preserve position if it's coordinates
        ...(Array.isArray(position) ? { position } : {}),
      },
    };
  });

  // If no instances, create empty
  if (processedInstances.length === 0) {
    return {
      ring_config: json.ring_config,
      visual_metadata: json.visual_metadata,
      instances: processedInstances,
    };
  }

  // No auto-filler generation here.
  // The backend should provide all components including fillers.

  return {
    ring_config: json.ring_config,
    visual_metadata: json.visual_metadata,
    instances: processedInstances,
  };
};

/**
 * Converts internal GUI format back to external JSON format.
 * Exports as 'layout_data' for backend compatibility.
 */
// Return type any to fit backend expected structure
export const exportAdapter = (graph: IntentGraph): any => {
  const exportedInstances = graph.instances.map(inst => {
    const { side, order, meta, name, device, type, id, ...topLevelFields } =
      inst as Instance & Record<string, any>;

    // Extract metadata
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _original_position, position: metaPos } = meta || {};

    const normalizedPinConnection =
      topLevelFields.pin_connection &&
      typeof topLevelFields.pin_connection === 'object'
        ? topLevelFields.pin_connection
        : undefined;

    const exportedBusinessFields: Record<string, any> = {};
    const businessKeys = [
      'view_name',
      'domain',
      'pad_width',
      'pad_height',
      'direction',
      'voltage_domain',
      'orientation',
    ];

    businessKeys.forEach(key => {
      if (topLevelFields[key] !== undefined) {
        exportedBusinessFields[key] = topLevelFields[key];
      }
    });

    const normalizedOrder = Number.isFinite(Number(order))
      ? Math.max(1, Number(order))
      : 1;

    let position: string | [number, number] = metaPos || [0, 0];
    if (
      side === 'top' ||
      side === 'right' ||
      side === 'bottom' ||
      side === 'left'
    ) {
      position = `${side}_${normalizedOrder - 1}`;
    } else {
      const cornerPos =
        meta?.location || _original_position || meta?._relative_position;
      if (
        cornerPos === 'top_left' ||
        cornerPos === 'top_right' ||
        cornerPos === 'bottom_left' ||
        cornerPos === 'bottom_right'
      ) {
        position = cornerPos;
      }
    }

    return {
      id,
      name,
      device,
      type,
      position, // Pass position back if we have it
      ...(normalizedPinConnection
        ? { pin_connection: normalizedPinConnection }
        : {}),
      ...exportedBusinessFields,
    };
  });

  return {
    ring_config: graph.ring_config,
    layout_data: exportedInstances, // Use 'layout_data' as expected by new backend logic
    instances: exportedInstances, // Keep 'instances' for legacy compatibility tools
  };
};
