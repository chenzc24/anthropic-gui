import React, { useState, useEffect } from 'react';

interface PropertyEditorProps {
  data: any;
  onChange: (newData: any) => void;
  readOnlyKeys?: string[];
}

export const PropertyEditor: React.FC<PropertyEditorProps> = ({ data, onChange, readOnlyKeys = [] }) => {
  const [localData, setLocalData] = useState(data);
  // Independent state for text input to allow typing invalid/partial strings
  const [chipSizeInput, setChipSizeInput] = useState("");

  // Resolve chip size keys
  const widthKey = data && data.chip_width !== undefined ? 'chip_width' : 'width';
  const heightKey = data && data.chip_height !== undefined ? 'chip_height' : 'height';
  const hasChipSize = data && data[widthKey] !== undefined && data[heightKey] !== undefined;

  // Resolve Side Counts keys
  const sideCountPatternA = ['top_count', 'right_count', 'bottom_count', 'left_count'];
  const sideCountPatternB = ['num_pads_top', 'num_pads_right', 'num_pads_bottom', 'num_pads_left'];
  
  let sideCountKeys: string[] = [];
  let hasSideCounts = false;
  let sideCountLabels = { top: '', right: '', bottom: '', left: '' };

  if (data && sideCountPatternA.every(k => data[k] !== undefined)) {
      hasSideCounts = true;
      sideCountKeys = sideCountPatternA;
      sideCountLabels = { top: 'top_count', right: 'right_count', bottom: 'bottom_count', left: 'left_count' };
  } else if (data && sideCountPatternB.every(k => data[k] !== undefined)) {
      hasSideCounts = true;
      sideCountKeys = sideCountPatternB;
      sideCountLabels = { top: 'num_pads_top', right: 'num_pads_right', bottom: 'num_pads_bottom', left: 'num_pads_left' };
  }

  useEffect(() => {
    setLocalData(data);
    // Sync chip size string from incoming data if it exists
    if (hasChipSize) {
      setChipSizeInput(`${data[widthKey]} * ${data[heightKey]}`);
    }
  }, [data, hasChipSize, widthKey, heightKey]);

  const handleChange = (key: string, value: any) => {
    const updated = { ...localData, [key]: value };
    setLocalData(updated);
    onChange(updated);
  };

  const handleChipSizeChange = (val: string) => {
    setChipSizeInput(val);
    const parts = val.split('*');
    if (parts.length === 2) {
      const w = parseFloat(parts[0].trim());
      const h = parseFloat(parts[1].trim());
      if (!isNaN(w) && !isNaN(h)) {
        // Update both width and height properties using resolved keys
        const updated = { ...localData, [widthKey]: w, [heightKey]: h };
        setLocalData(updated);
        onChange(updated);
      }
    }
  };

  const renderInput = (key: string, value: any, onValueChange?: (val: any) => void) => {
    const handleValChange = onValueChange || ((val) => handleChange(key, val));

    if (readOnlyKeys.includes(key)) {
      return (
        <input 
          type="text" 
          value={String(value)} 
          disabled 
          className="w-full px-2 py-1 text-sm bg-gray-100 border rounded cursor-not-allowed"
        />
      );
    }

    if (key === 'side') {
       return (
         <select 
           value={value} 
           onChange={(e) => handleValChange(e.target.value)}
           className="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500"
         >
           <option value="top">top</option>
           <option value="right">right</option>
           <option value="bottom">bottom</option>
           <option value="left">left</option>
         </select>
       );
    }

    if (key === 'placement_order') {
      return (
        <select 
          value={value} 
          onChange={(e) => handleValChange(e.target.value)}
          className="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500"
        >
          <option value="clockwise">clockwise</option>
          <option value="counterclockwise">counterclockwise</option>
        </select>
      );
   }

    if (key === 'domain') {
      return (
        <select 
          value={value || ''} 
          onChange={(e) => handleValChange(e.target.value === '' ? null : e.target.value)}
          className="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500"
        >
          <option value="">null</option>
          <option value="digital">digital</option>
          <option value="analog">analog</option>
        </select>
      );
   }

    if (typeof value === 'boolean') {
      return (
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => handleValChange(e.target.checked)}
          className="h-4 w-4 text-blue-600 rounded"
        />
      );
    }

    if (typeof value === 'number') {
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => handleValChange(parseFloat(e.target.value))}
          className="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500"
        />
      );
    }

    if (typeof value === 'string') {
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => handleValChange(e.target.value)}
          className="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500"
        />
      );
    }
    
    // Fallback for objects/arrays (simple JSON view for now or skip)
    return <div className="text-xs text-gray-400 italic">Complex type (edit as JSON below)</div>;
  };

  // Special handling for keys
  let hiddenKeys = ['id', 'meta', 'pin_config', 'view_name', 'pad_height', 'pad_width'];
  if (hasChipSize) {
    hiddenKeys.push(widthKey);
    hiddenKeys.push(heightKey);
  }
  if (hasSideCounts) {
    hiddenKeys = [...hiddenKeys, ...sideCountKeys];
  }
  
  // Filter visible keys
  const keys = Object.keys(localData).filter(k => !hiddenKeys.includes(k));
  
  const meta = localData.meta || {};
  let metaKeys = Object.keys(meta).filter(k => !hiddenKeys.includes(k));

  // Ensure 'domain' is visible for instances if missed
  if (localData.device !== undefined && !metaKeys.includes('domain')) {
      metaKeys.unshift('domain');
  }

  const handleMetaChange = (metaKey: string, metaValue: any) => {
      const newMeta = { ...meta, [metaKey]: metaValue };
      handleChange('meta', newMeta);
  };

  const addMetaField = () => {
      const key = prompt("Enter new meta field name:");
      if (key && !meta[key]) {
          handleMetaChange(key, "value");
      }
  };
  
  const deleteMetaField = (mKey: string) => {
      const newMeta = { ...meta };
      delete newMeta[mKey];
      handleChange('meta', newMeta);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-3">
        {/* Chip Size Composite Field */}
        {hasChipSize && (
            <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">CHIP SIZE</label>
            <input
                type="text"
                value={chipSizeInput}
                onChange={(e) => handleChipSizeChange(e.target.value)}
                className="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500"
                placeholder="Width * Height"
            />
            </div>
        )}

        {/* Side Counts Composite Field */}
        {hasSideCounts && (
            <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">SIDE COUNTS</label>
                <div className="grid grid-cols-2 gap-2 p-2 border rounded bg-gray-50">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase text-center">Top</span>
                        <input
                            type="number"
                            value={localData[sideCountLabels.top]}
                            onChange={(e) => handleChange(sideCountLabels.top, parseFloat(e.target.value))}
                            className="w-full px-1 py-1 text-sm text-center border rounded"
                        />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase text-center">Right</span>
                        <input
                            type="number"
                            value={localData[sideCountLabels.right]}
                            onChange={(e) => handleChange(sideCountLabels.right, parseFloat(e.target.value))}
                            className="w-full px-1 py-1 text-sm text-center border rounded"
                        />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase text-center">Bottom</span>
                        <input
                            type="number"
                            value={localData[sideCountLabels.bottom]}
                            onChange={(e) => handleChange(sideCountLabels.bottom, parseFloat(e.target.value))}
                            className="w-full px-1 py-1 text-sm text-center border rounded"
                        />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase text-center">Left</span>
                        <input
                            type="number"
                            value={localData[sideCountLabels.left]}
                            onChange={(e) => handleChange(sideCountLabels.left, parseFloat(e.target.value))}
                            className="w-full px-1 py-1 text-sm text-center border rounded"
                        />
                    </div>
                </div>
            </div>
        )}

        {/* Main Fields */}
        {keys.map(key => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">{key}</label>
            {renderInput(key, localData[key])}
          </div>
        ))}

        {/* Meta Fields - merged visually */}
        {metaKeys.map(mKey => (
             <div key={`meta-${mKey}`} className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                     <label className="text-xs font-semibold text-gray-500 uppercase">{mKey}</label>
                     <button 
                        onClick={() => deleteMetaField(mKey)}
                        className="text-xs text-red-400 hover:text-red-600"
                    >
                        x
                    </button>
                </div>
                {renderInput(mKey, meta[mKey], (val) => handleMetaChange(mKey, val))}
             </div>
        ))}
      </div>

      <div className="border-t pt-2">
         <button 
             onClick={addMetaField}
             className="text-xs text-blue-600 hover:text-blue-800"
         >
             + Add Property
         </button>
      </div>
    </div>
  );
};
