import React, { useState, useEffect } from 'react';

import {
  buildPinConfigTemplate,
  supportedProcessNodes,
} from '../utils/pinConfigTemplates';

interface PropertyEditorProps {
  data: any;
  onChange: (newData: any) => void;
  readOnlyKeys?: string[];
  ringConfig?: any;
}

interface PinRow {
  rowId: string;
  pinName: string;
  label: string;
}

const makePinRowId = () =>
  `pinrow_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const parsePinConfigRows = (value: any): PinRow[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).map(([pinName, cfg]) => {
    if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
      return {
        rowId: makePinRowId(),
        pinName,
        label: String((cfg as Record<string, any>).label ?? ''),
      };
    }

    return {
      rowId: makePinRowId(),
      pinName,
      label: String(cfg ?? ''),
    };
  });
};

const pinRowsToConfig = (rows: PinRow[]): Record<string, { label: string }> =>
  rows.reduce((acc, row) => {
    const trimmedPin = row.pinName.trim();
    if (!trimmedPin) return acc;
    acc[trimmedPin] = { label: row.label };
    return acc;
  }, {} as Record<string, { label: string }>);

export const PropertyEditor: React.FC<PropertyEditorProps> = ({
  data,
  onChange,
  readOnlyKeys = [],
  ringConfig,
}) => {
  const [localData, setLocalData] = useState(data);
  // Independent state for text input to allow typing invalid/partial strings
  const [chipSizeInput, setChipSizeInput] = useState('');
  const [pinRows, setPinRows] = useState<PinRow[]>([]);

  // Resolve chip size keys
  const widthKey =
    data && data.chip_width !== undefined ? 'chip_width' : 'width';
  const heightKey =
    data && data.chip_height !== undefined ? 'chip_height' : 'height';
  const hasChipSize =
    data && data[widthKey] !== undefined && data[heightKey] !== undefined;

  // Resolve Side Counts keys
  const sideCountPatternA = [
    'top_count',
    'right_count',
    'bottom_count',
    'left_count',
  ];
  const sideCountPatternB = [
    'num_pads_top',
    'num_pads_right',
    'num_pads_bottom',
    'num_pads_left',
  ];

  let sideCountKeys: string[] = [];
  let hasSideCounts = false;
  let sideCountLabels = { top: '', right: '', bottom: '', left: '' };

  if (data && sideCountPatternA.every(k => data[k] !== undefined)) {
    hasSideCounts = true;
    sideCountKeys = sideCountPatternA;
    sideCountLabels = {
      top: 'top_count',
      right: 'right_count',
      bottom: 'bottom_count',
      left: 'left_count',
    };
  } else if (data && sideCountPatternB.every(k => data[k] !== undefined)) {
    hasSideCounts = true;
    sideCountKeys = sideCountPatternB;
    sideCountLabels = {
      top: 'num_pads_top',
      right: 'num_pads_right',
      bottom: 'num_pads_bottom',
      left: 'num_pads_left',
    };
  }

  useEffect(() => {
    setLocalData(data);
    // Sync chip size string from incoming data if it exists
    if (hasChipSize) {
      setChipSizeInput(`${data[widthKey]} * ${data[heightKey]}`);
    }
    const pinConfigValue =
      data?.meta?.pin_config !== undefined
        ? data?.meta?.pin_config
        : data?.pin_config;
    setPinRows(parsePinConfigRows(pinConfigValue));
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

  const renderInput = (
    key: string,
    value: any,
    onValueChange?: (val: any) => void,
  ) => {
    const handleValChange = onValueChange || (val => handleChange(key, val));

    if (key === 'pin_config') {
      const commitRows = (nextRows: PinRow[]) => {
        const asConfig = pinRowsToConfig(nextRows);
        handleValChange(
          Object.keys(asConfig).length > 0 ? asConfig : undefined,
        );
      };

      const updateRows = (
        nextRows: PinRow[],
        options: { commit?: boolean } = {},
      ) => {
        const { commit = true } = options;
        setPinRows(nextRows);
        if (commit) {
          commitRows(nextRows);
        }
      };

      const addRow = () => {
        updateRows(
          [
            ...pinRows,
            {
              rowId: makePinRowId(),
              pinName: `PIN_${pinRows.length + 1}`,
              label: '',
            },
          ],
          { commit: false },
        );
      };

      const setRowPinName = (index: number, pinName: string) => {
        setPinRows(
          pinRows.map((row, i) =>
            i === index
              ? {
                  ...row,
                  pinName,
                }
              : row,
          ),
        );
      };

      const setRowLabel = (index: number, label: string) => {
        setPinRows(
          pinRows.map((row, i) =>
            i === index
              ? {
                  ...row,
                  label,
                }
              : row,
          ),
        );
      };

      const commitCurrentRows = () => {
        commitRows(pinRows);
      };

      const deleteRow = (index: number) => {
        updateRows(pinRows.filter((_, i) => i !== index));
      };

      const processNode = String(
        ringConfig?.process_node ||
          localData?.process_node ||
          localData?.meta?.process_node ||
          'T180',
      ).toUpperCase();

      const autoFill = () => {
        const generated = buildPinConfigTemplate({
          processNode,
          device: localData?.device,
          instanceName: localData?.name,
          domain: localData?.domain ?? localData?.meta?.domain,
          pinConfigProfiles: ringConfig?.pin_config_profiles,
        });
        if (!generated) {
          return;
        }
        updateRows(parsePinConfigRows(generated));
      };

      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              Process: <span className="font-semibold">{processNode}</span> (
              {supportedProcessNodes().join(', ')})
            </div>
            <button
              type="button"
              onClick={autoFill}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Auto Fill Pins
            </button>
          </div>

          {pinRows.map((row, index) => (
            <div key={row.rowId} className="grid grid-cols-12 gap-2">
              <input
                type="text"
                value={row.pinName}
                onChange={e => setRowPinName(index, e.target.value)}
                onBlur={commitCurrentRows}
                className="col-span-5 px-2 py-1 text-sm border rounded font-mono focus:ring-1 focus:ring-blue-500"
                placeholder="pin_name"
              />
              <input
                type="text"
                value={row.label}
                onChange={e => setRowLabel(index, e.target.value)}
                onBlur={commitCurrentRows}
                className="col-span-6 px-2 py-1 text-sm border rounded font-mono focus:ring-1 focus:ring-blue-500"
                placeholder="label"
              />
              <button
                type="button"
                onClick={() => deleteRow(index)}
                className="col-span-1 text-xs text-red-500 hover:text-red-700"
              >
                x
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            className="w-fit text-xs text-blue-600 hover:text-blue-800"
          >
            + Add Pin
          </button>
        </div>
      );
    }

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
          onChange={e => handleValChange(e.target.value)}
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
          onChange={e => handleValChange(e.target.value)}
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
          onChange={e =>
            handleValChange(e.target.value === '' ? null : e.target.value)
          }
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
          onChange={e => handleValChange(e.target.checked)}
          className="h-4 w-4 text-blue-600 rounded"
        />
      );
    }

    if (typeof value === 'number') {
      return (
        <input
          type="number"
          value={value}
          onChange={e => handleValChange(parseFloat(e.target.value))}
          className="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500"
        />
      );
    }

    if (typeof value === 'string') {
      return (
        <input
          type="text"
          value={value}
          onChange={e => handleValChange(e.target.value)}
          className="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500"
        />
      );
    }

    // Fallback for objects/arrays (simple JSON view for now or skip)
    return (
      <div className="text-xs text-gray-400 italic">
        Complex type (edit as JSON below)
      </div>
    );
  };

  // Special handling for keys
  let hiddenKeys = [
    'id',
    'meta',
    'view_name',
    'pad_height',
    'pad_width',
    'side',
    'order',
    '_relative_position',
    '_original_position',
  ];
  if (hasChipSize) {
    hiddenKeys.push(widthKey);
    hiddenKeys.push(heightKey);
  }
  if (hasSideCounts) {
    hiddenKeys = [...hiddenKeys, ...sideCountKeys];
  }
  const hiddenMainKeys = [...hiddenKeys, 'pin_config'];

  // Filter visible keys
  const keys = Object.keys(localData).filter(k => !hiddenMainKeys.includes(k));

  const meta = localData.meta || {};
  const metaKeys = Object.keys(meta).filter(k => !hiddenKeys.includes(k));

  const localType = String(localData?.type || '').toLowerCase();
  const localDevice = String(localData?.device || '').toUpperCase();
  const isCornerInstance =
    localType === 'corner' ||
    localData?.side === 'corner' ||
    localDevice.includes('CORNER');
  const isFillerLikeInstance =
    localType === 'filler' ||
    localType === 'blank' ||
    localDevice.includes('FILLER') ||
    localDevice.includes('RCUT') ||
    localDevice === 'BLANK';

  // Ensure 'domain' is visible for instances if missed
  if (localData.device !== undefined && !metaKeys.includes('domain')) {
    metaKeys.unshift('domain');
  }
  if (
    localData.device !== undefined &&
    !isCornerInstance &&
    !isFillerLikeInstance &&
    !metaKeys.includes('pin_config')
  ) {
    metaKeys.unshift('pin_config');
  }

  const handleMetaChange = (metaKey: string, metaValue: any) => {
    const newMeta = { ...meta, [metaKey]: metaValue };
    handleChange('meta', newMeta);
  };

  const addMetaField = () => {
    const key = prompt('Enter new meta field name:');
    if (key && !meta[key]) {
      handleMetaChange(key, 'value');
    }
  };

  const deleteMetaField = (mKey: string) => {
    const newMeta = { ...meta };
    delete newMeta[mKey];
    handleChange('meta', newMeta);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-3">
        {/* Chip Size Composite Field */}
        {hasChipSize && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">
              CHIP SIZE
            </label>
            <input
              type="text"
              value={chipSizeInput}
              onChange={e => handleChipSizeChange(e.target.value)}
              className="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500"
              placeholder="Width * Height"
            />
          </div>
        )}

        {/* Side Counts Composite Field */}
        {hasSideCounts && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">
              SIDE COUNTS
            </label>
            <div className="grid grid-cols-2 gap-2 p-2 border rounded bg-gray-50">
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-400 uppercase text-center">
                  Top
                </span>
                <input
                  type="number"
                  value={localData[sideCountLabels.top]}
                  disabled
                  className="w-full px-1 py-1 text-sm text-center border rounded bg-gray-100"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-400 uppercase text-center">
                  Right
                </span>
                <input
                  type="number"
                  value={localData[sideCountLabels.right]}
                  disabled
                  className="w-full px-1 py-1 text-sm text-center border rounded bg-gray-100"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-400 uppercase text-center">
                  Bottom
                </span>
                <input
                  type="number"
                  value={localData[sideCountLabels.bottom]}
                  disabled
                  className="w-full px-1 py-1 text-sm text-center border rounded bg-gray-100"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-400 uppercase text-center">
                  Left
                </span>
                <input
                  type="number"
                  value={localData[sideCountLabels.left]}
                  disabled
                  className="w-full px-1 py-1 text-sm text-center border rounded bg-gray-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* Main Fields */}
        {keys.map(key => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">
              {key}
            </label>
            {renderInput(key, localData[key])}
          </div>
        ))}

        {/* Meta Fields - merged visually */}
        {metaKeys.map(mKey => (
          <div key={`meta-${mKey}`} className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-gray-500 uppercase">
                {mKey}
              </label>
              <button
                onClick={() => deleteMetaField(mKey)}
                className="text-xs text-red-400 hover:text-red-600"
              >
                x
              </button>
            </div>
            {renderInput(mKey, meta[mKey], val => handleMetaChange(mKey, val))}
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
