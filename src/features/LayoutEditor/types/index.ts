export interface VisualMetadata {
  colors: Record<string, string>;
  dimensions: {
    pad_width: number;
    pad_height: number;
    corner_size: number;
    [key: string]: number;
  };
}

export type Side = 'top' | 'right' | 'bottom' | 'left';
export type PlacementOrder = 'clockwise' | 'counterclockwise';

export interface RingConfig {
  width: number;
  height: number;
  placement_order: PlacementOrder;
  chip_width?: number; // Physical width in microns
  chip_height?: number; // Physical height in microns
  [key: string]: any;
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
  visual_metadata?: VisualMetadata;
  instances: Instance[];
}
