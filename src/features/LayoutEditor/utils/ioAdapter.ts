import { IntentGraph, Instance, Side } from '../types';

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

interface ExternalInstance {
  name: string;
  device: string;
  position: string;
  type: string;
  [key: string]: any;
}

interface ExternalGraph {
  ring_config: any;
  instances: ExternalInstance[];
}

/**
 * Parses external JSON format (string position "left_0")
 * into internal GUI format (structured side/order).
 */
export const importAdapter = (json: ExternalGraph): IntentGraph => {
  let processedInstances: Instance[] = json.instances.map(extInst => {
    const { position, name, device, type, ...rest } = extInst;

    let side: Side | 'corner' = 'top'; // Default
    let order = 0;

    // Regex for standard IO positions: "left_0", "top_12"
    const ioMatch = position.match(/^(top|bottom|left|right)_(\d+)$/);

    // Regex for corners: "top_left", "bottom_right"
    const cornerMatch = position.match(/^(top|bottom)_(left|right)$/);

    if (ioMatch) {
      side = ioMatch[1] as Side;
      order = parseInt(ioMatch[2], 10);
    } else if (cornerMatch) {
      side = 'corner' as any; // Allow 'corner' to exist in store but ignored by renderer
      // We store the original corner position in meta to restore it later
      // eslint-disable-next-line @typescript-eslint/dot-notation
      rest['_original_position'] = position;
    } else {
      // eslint-disable-next-line no-console
      console.warn(`Unknown position format: ${position} for instance ${name}`);
      // Fallback or keep as is? Let's treat as 'corner' type so it doesn't mess up IOs
      side = 'corner' as any;
      // eslint-disable-next-line @typescript-eslint/dot-notation
      rest['_original_position'] = position;
    }

    return {
      id: generateId(),
      name,
      device,
      type,
      side: side as Side, // Cast to satisfy type system
      order,
      meta: {
        ...rest, // Store all extra fields (pin_config, domain, etc) in meta
        // If it was a corner/special, we might have added _original_position here
      },
    };
  });

  // Inject fillers if none exist
  const totalFillers = processedInstances.filter(
    inst =>
      inst.type === 'filler' ||
      (inst.device && inst.device.toUpperCase().includes('FILLER')),
  ).length;

  if (totalFillers === 0) {
    const sides: Side[] = ['top', 'right', 'bottom', 'left'];
    const newInstances: Instance[] = [];

    const createFiller = (side: Side, order: number): Instance => ({
      id: generateId(),
      name: `FILLER_auto_${generateId()}`,
      device: 'FILLER_auto',
      type: 'filler',
      side,
      order,
      meta: {
        view_name: 'layout',
        generated: true,
      },
    });

    // Preserve corners/others
    const nonSideInstances = processedInstances.filter(
      inst => !sides.includes(inst.side),
    );
    newInstances.push(...nonSideInstances);

    sides.forEach(side => {
      const sideInstances = processedInstances
        .filter(inst => inst.side === side)
        .sort((a, b) => a.order - b.order);

      if (sideInstances.length === 0) return;

      let currentOrder = 0;

      // Add 2 fillers at start
      newInstances.push(createFiller(side, currentOrder++));
      newInstances.push(createFiller(side, currentOrder++));

      sideInstances.forEach((inst, index) => {
        if (index > 0) {
          // Add 2 fillers between cells
          newInstances.push(createFiller(side, currentOrder++));
          newInstances.push(createFiller(side, currentOrder++));
        }
        // Add IO
        newInstances.push({ ...inst, order: currentOrder++ });
      });

      // Add 2 fillers at end
      newInstances.push(createFiller(side, currentOrder++));
      newInstances.push(createFiller(side, currentOrder++));
    });

    processedInstances = newInstances;
  }

  return {
    ring_config: json.ring_config,
    instances: processedInstances,
  };
};

/**
 * Converts internal GUI format back to external JSON format.
 */
export const exportAdapter = (graph: IntentGraph): ExternalGraph => {
  const exportedInstances = graph.instances.map(inst => {
    const { side, order, meta, name, device, type } = inst;

    // Restore non-GUI fields from meta
    const { _original_position, ...otherMeta } = meta || {};

    let position = '';

    if (_original_position) {
      // It was a corner or special element
      position = _original_position;
    } else {
      // It's a standard IO, reconstruct position string
      position = `${side}_${order}`;
    }

    return {
      name,
      device,
      view_name: otherMeta.view_name || 'layout', // Default or restore
      ...otherMeta, // Spread all other preserved fields (domain, pins, etc)
      position,
      type,
    };
  });

  return {
    ring_config: graph.ring_config,
    instances: exportedInstances,
  };
};
