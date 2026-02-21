import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useIORingStore } from '../store/useIORingStore';
import { Instance, Side } from '../types';
import clsx from 'clsx';

// Visual constants scaled down from 180nm/28nm config for screen
const SCALE = 0.6; 
const PAD_W_LOGICAL = 80 * SCALE; // Visual width on Top/Bottom
const PAD_H_LOGICAL = 120 * SCALE; // Visual height on Top/Bottom (Depth)
const FILLER_W_LOGICAL = 20 * SCALE; 
const CORNER_SIZE = 130 * SCALE;
const PADDING = 40;

const DEFAULT_CANVAS_SIZE = 800; // Starting canvas size
const MIN_RING_SPAN = 10; // Minimum span for empty sides

export const RingCanvas: React.FC = () => {
  const { graph, selectInstance, selectedId, moveInstance, copyInstance, pasteInstance, deleteInstance } = useIORingStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        // Ignore if input/textarea is focused, unless it is the canvas itself (which doesn't focus really)
        // Actually, we want global hotkeys, but not when typing in a property field.
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
            return;
        }

        // Copy: Ctrl+C
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
            if (selectedId) {
                copyInstance(selectedId);
            }
        }
        // Paste: Ctrl+V
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            let targetSide: Side = 'top';
            if (selectedId) {
                const inst = graph.instances.find((i: Instance) => i.id === selectedId);
                if (inst && (inst.side as any) !== 'corner') targetSide = inst.side;
            }
            pasteInstance(targetSide);
        }
        // Delete: Delete or Backspace
        if (e.key === 'Delete' || e.key === 'Backspace') {
             if (selectedId) {
                 deleteInstance(selectedId);
             }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, graph, copyInstance, pasteInstance, deleteInstance]);

  const getColor = (deviceType: string = '', type: string = '', domain?: string) => {
    if (type === 'space') return 'rgba(255, 255, 255, 0.01)';
    if (type === 'corner') return '#FF8888';
    if (type === 'filler') return '#D3D3D3'; 
    if (domain?.toLowerCase() === 'digital') return '#32CD32';
    if (domain?.toLowerCase() === 'analog') return '#4A90E2';
    if (deviceType.includes('DGZ') || deviceType.includes('Digital') || deviceType.includes('PDDW')) return '#32CD32'; 
    if (deviceType.includes('ANA') || deviceType.includes('AC') || deviceType.includes('PDB')) return '#4A90E2';
    if (deviceType.includes('CORNER')) return '#FF6B6B';
    return '#3b82f6'; 
  };
  
  // Helper: Get visual width along the perimeter for an instance
  const getInstanceWidth = (inst: Instance) => {
    if (inst.type === 'space') {
      return FILLER_W_LOGICAL;
    }
    // If it's a filler type or named filler, use small width
    if (inst.type === 'filler' || inst.device.includes('FILLER')) {
      return FILLER_W_LOGICAL;
    }
    return PAD_W_LOGICAL;
  };

  // Group instances
  const { sides, corners } = useMemo(() => {
    const s: Record<Side, Instance[]> = { top: [], right: [], bottom: [], left: [] };
    const c: Record<string, Instance | null> = { 
      top_left: null, top_right: null, bottom_left: null, bottom_right: null 
    };

    graph.instances.forEach((inst: Instance) => {
      if ((inst.side as any) === 'corner') {
        const pos = inst.meta?._original_position || '';
        if (pos === 'top_left') c.top_left = inst;
        else if (pos === 'top_right') c.top_right = inst;
        else if (pos === 'bottom_left') c.bottom_left = inst;
        else if (pos === 'bottom_right') c.bottom_right = inst;
      } else if (s[inst.side]) {
        s[inst.side].push(inst);
      }
    });

    Object.keys(s).forEach(k => {
      s[k as Side].sort((a, b) => a.order - b.order);
    });

    return { sides: s, corners: c };
  }, [graph.instances]);

  // --- Dynamic Layout Calculation ---

  // Calculate cumulative length for each side
  const sideLengths = useMemo(() => {
    const lens: Record<Side, number> = { top: 0, right: 0, bottom: 0, left: 0 };
    Object.keys(sides).forEach((key) => {
      const side = key as Side;
      lens[side] = sides[side].reduce((acc, inst) => acc + getInstanceWidth(inst), 0);
    });
    return lens;
  }, [sides]);

  // Calculate Ring Dims (Inner Span)
  const ringInnerWidth = Math.max(sideLengths.top, sideLengths.bottom, MIN_RING_SPAN);
  const ringInnerHeight = Math.max(sideLengths.left, sideLengths.right, MIN_RING_SPAN);

  // Calculate Visual Boundaries centered
  const visualW = ringInnerWidth + (CORNER_SIZE * 2);
  const visualH = ringInnerHeight + (CORNER_SIZE * 2);
  
  // Dynamic Canvas Size (grow if needed)
  const canvasW = Math.max(DEFAULT_CANVAS_SIZE, visualW + PADDING * 2);
  const canvasH = Math.max(DEFAULT_CANVAS_SIZE, visualH + PADDING * 2);
  
  const cx = canvasW / 2;
  const cy = canvasH / 2;

  // structure bounding box
  const structLeft = cx - visualW / 2;
  const structTop = cy - visualH / 2;
  const structRight = cx + visualW / 2;
  const structBottom = cy + visualH / 2;

  // Pad Position Helper
  const getPos = (side: Side, index: number, instances: Instance[]) => {
    const isCounterClockwise = graph.ring_config?.placement_order === 'counterclockwise';

    // Current Offset: sum of widths of all instances BEFORE this index
    const preInstances = instances.slice(0, index);
    const offset = preInstances.reduce((acc, i) => acc + getInstanceWidth(i), 0);
    const myW = getInstanceWidth(instances[index]); 

    // Corner Anchors (Inner edge of corners)
    const anchorTopLeftX = structLeft + CORNER_SIZE;
    const anchorTopRightY = structTop + CORNER_SIZE;
    const anchorBottomRightX = structRight - CORNER_SIZE;
    const anchorBottomLeftY = structBottom - CORNER_SIZE;

    // Additional Anchors for Counter Clockwise
    const anchorTopRightX = structRight - CORNER_SIZE;
    const anchorBottomRightY = structBottom - CORNER_SIZE;
    const anchorBottomLeftX = structLeft + CORNER_SIZE;
    const anchorTopLeftY = structTop + CORNER_SIZE;

    // Center deviation if Corner > PadH (to align outer edge or center)
    // Visualizer shows outer alignment usually. Let's align outer edges.
    // Top side: pads align with structTop
    // Bottom side: pads align with structBottom - PAD_H
    // Left side: pads align with structLeft
    // Right side: pads align with structRight - PAD_H
    
    // Actually, CORNER_SIZE (78) vs PAD_H (72).
    // If we align outer, Top pads y = structTop.
    // If Corner is at structTop, it is bigger by 6px.
    // If we align outer, inner edge is diff.
    // Let's align centers of the "track".
    // Track depth is CORNER_SIZE basically.
    const centerDiff = (CORNER_SIZE - PAD_H_LOGICAL) / 2;

    if (side === 'top') {
      if (isCounterClockwise) {
        // Top: R -> L (Start from anchorTopRightX, subtract offset)
        return { 
          x: anchorTopRightX - (offset + myW), 
          y: structTop + centerDiff, 
          w: myW, 
          h: PAD_H_LOGICAL, 
          rot: 0 
        };
      }
      return { 
        x: anchorTopLeftX + offset, 
        y: structTop + centerDiff, 
        w: myW, 
        h: PAD_H_LOGICAL, 
        rot: 0 
      };
    } else if (side === 'right') {
      if (isCounterClockwise) {
        // Right: B -> T (Start from anchorBottomRightY, subtract offset)
        return { 
          x: (structRight - PAD_H_LOGICAL) - centerDiff, 
          y: anchorBottomRightY - (offset + myW), 
          w: PAD_H_LOGICAL, 
          h: myW, 
          rot: 90 
        };
      }
      return { 
        x: (structRight - PAD_H_LOGICAL) - centerDiff, 
        y: anchorTopRightY + offset, 
        w: PAD_H_LOGICAL, 
        h: myW, 
        rot: 90 
      };
    } else if (side === 'bottom') {
      if (isCounterClockwise) {
        // Bottom: L -> R (Start from anchorBottomLeftX, add offset)
        return { 
          x: anchorBottomLeftX + offset, 
          y: (structBottom - PAD_H_LOGICAL) - centerDiff, 
          w: myW, 
          h: PAD_H_LOGICAL, 
          rot: 0 
        };
      }
      return { 
        x: anchorBottomRightX - (offset + myW), 
        y: (structBottom - PAD_H_LOGICAL) - centerDiff, 
        w: myW, 
        h: PAD_H_LOGICAL, 
        rot: 0 
      };
    } else { // left
       if (isCounterClockwise) {
          // Left: T -> B (Start from anchorTopLeftY, add offset)
          return { 
            x: structLeft + centerDiff, 
            y: anchorTopLeftY + offset, 
            w: PAD_H_LOGICAL, 
            h: myW, 
            rot: 270 
          };
       }
       return { 
         x: structLeft + centerDiff, 
         y: anchorBottomLeftY - (offset + myW), 
         w: PAD_H_LOGICAL, 
         h: myW, 
         rot: 270 
       };
    }
  };

  const DrawCorner = ({ inst, x, y }: { inst: Instance | null, x: number, y: number }) => {
    if (!inst) {
      return (
        <rect x={x} y={y} width={CORNER_SIZE} height={CORNER_SIZE} 
          fill="#eee" stroke="#ccc" strokeDasharray="4" rx="4" />
      );
    }
    const color = getColor(inst.device, 'corner', inst.meta?.domain);
    const isSelected = inst.id === selectedId;

    return (
      <g 
        onClick={(e) => { e.stopPropagation(); selectInstance(inst.id); }} 
        className="cursor-pointer hover:opacity-90"
      >
        <rect 
          x={x} y={y} width={CORNER_SIZE} height={CORNER_SIZE} 
          fill={color} stroke={isSelected ? 'blue' : 'black'} strokeWidth={isSelected ? 3 : 2}
        />
        <text 
          x={x + CORNER_SIZE/2} y={y + CORNER_SIZE/2} 
          textAnchor="middle" dy=".3em" fontSize="10" fontWeight="bold"
        >
          CORNER
        </text>
      </g>
    );
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingId || !svgRef.current) return;
    const instance = graph.instances.find((i: Instance) => i.id === draggingId);
    if (!instance || (instance.side as any) === 'corner') return;

    const CTM = svgRef.current.getScreenCTM();
    if (!CTM) return;
    const mx = (e.clientX - CTM.e) / CTM.a;
    const my = (e.clientY - CTM.f) / CTM.d;

    // Detect closest side
    const trackCenterOffset = CORNER_SIZE / 2;
    const yTop = structTop + trackCenterOffset;
    const yBottom = structBottom - trackCenterOffset;
    const xLeft = structLeft + trackCenterOffset;
    const xRight = structRight - trackCenterOffset;

    const distTop = Math.abs(my - yTop);
    const distBottom = Math.abs(my - yBottom);
    const distLeft = Math.abs(mx - xLeft);
    const distRight = Math.abs(mx - xRight);

    let minD = distTop;
    let closestSide: Side = 'top';

    if (distRight < minD) { minD = distRight; closestSide = 'right'; }
    if (distBottom < minD) { minD = distBottom; closestSide = 'bottom'; }
    if (distLeft < minD) { minD = distLeft; closestSide = 'left'; }

    // Calc index
    const insts = sides[closestSide];
    const total = insts.length;

    // Anchor Logic Replica
    const anchorTopLeftX = structLeft + CORNER_SIZE;
    const anchorTopRightY = structTop + CORNER_SIZE;
    const anchorBottomRightX = structRight - CORNER_SIZE;
    const anchorBottomLeftY = structBottom - CORNER_SIZE;

    const anchorTopRightX = structRight - CORNER_SIZE;
    const anchorBottomRightY = structBottom - CORNER_SIZE;
    const anchorBottomLeftX = structLeft + CORNER_SIZE;
    const anchorTopLeftY = structTop + CORNER_SIZE;

    const isCounterClockwise = graph.ring_config?.placement_order === 'counterclockwise';

    let dist = 0;
    if (closestSide === 'top') {
         if (isCounterClockwise) dist = anchorTopRightX - mx;
         else dist = mx - anchorTopLeftX;
    } 
    else if (closestSide === 'right')  {
         if (isCounterClockwise) dist = anchorBottomRightY - my;
         else dist = my - anchorTopRightY;
    }
    else if (closestSide === 'bottom') {
         if (isCounterClockwise) dist = mx - anchorBottomLeftX;
         else dist = anchorBottomRightX - mx;
    }
    else if (closestSide === 'left') {
         if (isCounterClockwise) dist = my - anchorTopLeftY;
         else dist = anchorBottomLeftY - my;
    }
    
    if (dist < 0) dist = 0;

    let currentX = 0;
    let foundIndex = 0; 
    let placed = false;
    
    for (let i = 0; i < total; i++) {
        const w = getInstanceWidth(insts[i]);
        // Simple center-based pivot
        if (dist < currentX + w / 2) {
            foundIndex = i;
            placed = true;
            break;
        }
        currentX += w;
    }
    if (!placed) foundIndex = total;

    // Only update if changed
    if (closestSide !== instance.side || foundIndex !== instance.order) {
       moveInstance(draggingId, closestSide, foundIndex);
    }
  };

  const handleMouseUp = () => setDraggingId(null);

  // Constants for corners
  const cornTL_x = structLeft; const cornTL_y = structTop;
  const cornTR_x = structRight - CORNER_SIZE; const cornTR_y = structTop;
  const cornBR_x = structRight - CORNER_SIZE; const cornBR_y = structBottom - CORNER_SIZE;
  const cornBL_x = structLeft; const cornBL_y = structBottom - CORNER_SIZE;

  return (
    <div className="flex-1 bg-gray-50 flex items-center justify-center overflow-auto p-4">
      <svg 
        ref={svgRef}
        width={canvasW} height={canvasH} 
        style={{ minWidth: canvasW, minHeight: canvasH }}
        className="bg-white shadow-xl rounded-lg select-none"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
      >
         <defs>
           <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
             <path d="M 20 0 L 0 0 0 20" fill="none" stroke="gray" strokeWidth="0.5" strokeOpacity="0.1"/>
           </pattern>
         </defs>
         <rect width="100%" height="100%" fill="url(#grid)" />

        {/* --- Corners --- */}
        <DrawCorner inst={corners.top_left} x={cornTL_x} y={cornTL_y} />
        <DrawCorner inst={corners.top_right} x={cornTR_x} y={cornTR_y} />
        <DrawCorner inst={corners.bottom_right} x={cornBR_x} y={cornBR_y} />
        <DrawCorner inst={corners.bottom_left} x={cornBL_x} y={cornBL_y} />

        {/* --- Sides --- */}
        {Object.entries(sides).map(([sideName, instances]) => (
          <g key={sideName}>
            {instances.map((inst, idx) => {
              const { x, y, w, h } = getPos(inst.side as Side, idx, instances);

              const isSelected = inst.id === selectedId;
              const color = getColor(inst.device, inst.type, inst.meta?.domain);
              
              const isVerticalBlock = (sideName === 'top' || sideName === 'bottom');
              const textRot = isVerticalBlock ? 90 : 0;
              
              const isFiller = inst.type === 'filler' || inst.device.includes('FILLER');
              const isSpace = inst.type === 'space';
              const displayName = isFiller ? 'FILLER' : (inst.name.length > 8 ? inst.name.substr(0, 6)+'..' : inst.name);

              const strokeColor = isSelected ? 'blue' : (isSpace ? '#ccc' : 'black');
              const strokeWidth = isSelected ? 3 : 1;
              const strokeDash = isSpace ? '4 2' : undefined;

              return (
                <g 
                  key={inst.id}
                  transform={`translate(${x}, ${y})`}
                  onMouseDown={(e) => { e.stopPropagation(); selectInstance(inst.id); setDraggingId(inst.id); }}
                  className={clsx("cursor-pointer", draggingId === inst.id && "opacity-70")}
                >
                  <rect 
                    width={w} height={h} 
                    fill={color} 
                    stroke={strokeColor} 
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDash}
                    className="transition-colors hover:brightness-110"
                  />
                  
                  {/* Label */}
                  {!isFiller && !isSpace && (
                  <g transform={`translate(${w/2}, ${h/2}) rotate(${textRot})`}>
                    <text 
                      textAnchor="middle" 
                      className="font-mono font-bold pointer-events-none"
                      style={{ fontSize: '10px' }}
                    >
                      <tspan x="0" dy="-0.2em">{displayName}</tspan>
                      <tspan x="0" dy="1.1em" fontSize="8" fill="#444">{inst.device}</tspan>
                    </text>
                  </g>
                  )}
                  {isFiller && (
                    <g transform={`translate(${w/2}, ${h/2}) rotate(${textRot})`}>
                       <text textAnchor="middle" dy="0.3em" fontSize="8" fill="#666">F</text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
};
