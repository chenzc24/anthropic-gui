export type Side = 'top' | 'right' | 'bottom' | 'left';
export type PlacementOrder = 'clockwise' | 'counterclockwise';

export interface RingConfig {
  width: number;
  height: number;
  placement_order: PlacementOrder;
}

export interface Instance {
  id: string; // Internal unique ID for React keys and selection
  name: string;
  device: string;
  type: string; // 'pad' | 'cell' | 'filler' | 'corner' usually
  side: Side;
  order: number;
  meta: Record<string, any>; // Flexible metadata
  [key: string]: any; // Allow other properties
}

export interface IntentGraph {
  ring_config: RingConfig;
  instances: Instance[];
}
