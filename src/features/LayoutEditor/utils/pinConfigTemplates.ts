type DomainType = 'analog' | 'digital';
type ProcessNode = 'T28' | 'T180';
export type DeviceClass = 'analog' | 'digital' | 'unsupported';

export interface PinConfigEntry {
  label: string;
}

export type PinConfigMap = Record<string, PinConfigEntry>;

interface DomainLabels {
  regPwr: string;
  regGnd: string;
  vdPwr: string;
  vdGnd: string;
}

interface ProcessPinProfile {
  analog: DomainLabels;
  digital: DomainLabels;
}

interface BuildPinConfigOptions {
  processNode?: string;
  device?: string;
  instanceName?: string;
  domain?: string | null;
  pinConfigProfiles?: Record<string, ProcessPinProfile>;
}

const DEFAULT_T180_PROFILE: ProcessPinProfile = {
  analog: {
    regPwr: 'VIOLA',
    regGnd: 'GIOLA',
    vdPwr: 'VIOHA',
    vdGnd: 'GIOHA',
  },
  digital: {
    regPwr: 'VIOLD',
    regGnd: 'GIOLD',
    vdPwr: 'VIOHD',
    vdGnd: 'GIOHD',
  },
};

const DEFAULT_T28_PROFILE: ProcessPinProfile = {
  analog: {
    regPwr: 'AVDD',
    regGnd: 'AVSS',
    vdPwr: 'TACVDD',
    vdGnd: 'TACVSS',
  },
  digital: {
    regPwr: 'VIOL',
    regGnd: 'GIOL',
    vdPwr: 'VIOH',
    vdGnd: 'GIOH',
  },
};

const PROCESS_DEFAULTS: Record<ProcessNode, ProcessPinProfile> = {
  T28: DEFAULT_T28_PROFILE,
  T180: DEFAULT_T180_PROFILE,
};

const T28_SUPPORTED_DEVICES = new Set<string>([
  'PDDW16SDGZ_V_G',
  'PDDW16SDGZ_H_G',
  'PVDD1DGZ_V_G',
  'PVDD1DGZ_H_G',
  'PVSS1DGZ_V_G',
  'PVSS1DGZ_H_G',
  'PVDD2POC_V_G',
  'PVDD2POC_H_G',
  'PVSS2DGZ_V_G',
  'PVSS2DGZ_H_G',
  'PDB3AC_V_G',
  'PDB3AC_H_G',
  'PVDD1AC_V_G',
  'PVDD1AC_H_G',
  'PVSS1AC_V_G',
  'PVSS1AC_H_G',
  'PVDD3A_V_G',
  'PVDD3A_H_G',
  'PVSS3A_V_G',
  'PVSS3A_H_G',
  'PVDD3AC_V_G',
  'PVDD3AC_H_G',
  'PVSS3AC_V_G',
  'PVSS3AC_H_G',
]);

const T180_SUPPORTED_DEVICES = new Set<string>([
  'PVDD1ANA',
  'PVSS1ANA',
  'PVDD1CDG',
  'PVSS1CDG',
  'PVDD2CDG',
  'PVSS2CDG',
  'PDDW0412SCDG',
]);

const T180_ANALOG_PREFERRED_DEVICES = new Set<string>(['PVDD1ANA', 'PVSS1ANA']);
const T180_DIGITAL_STRICT_DEVICES = new Set<string>(['PDDW0412SCDG']);

const SUPPORTED_DEVICES_BY_NODE: Record<ProcessNode, Set<string>> = {
  T28: T28_SUPPORTED_DEVICES,
  T180: T180_SUPPORTED_DEVICES,
};

const PIN_LABEL_FALLBACKS = {
  analogPwr: 'AVDD',
  analogGnd: 'AVSS',
  digitalVdd: 'VIOL',
  digitalVss: 'GIOL',
  digitalVddPst: 'VIOH',
  digitalVssPst: 'GIOH',
} as const;

interface T28ResolvedLabels {
  analogPwrRef: string;
  analogGndRef: string;
  digitalVdd: string;
  digitalVss: string;
  digitalVddPst: string;
  digitalVssPst: string;
}

const resolveDomain = (domain?: string | null): DomainType =>
  String(domain || '').toLowerCase() === 'digital' ? 'digital' : 'analog';

const resolveProcessNode = (processNode?: string): ProcessNode | null => {
  const normalized = String(processNode || 'T180').toUpperCase();
  if (normalized === 'T180') return 'T180';
  if (normalized === 'T28') return 'T28';
  return null;
};

const normalizeDeviceName = (device?: string): string =>
  String(device || '')
    .trim()
    .toUpperCase();

const getSupportedDevices = (resolvedNode: string): Set<string> =>
  // Preserve previous behavior: anything non-T180 falls back to T28 list.
  resolvedNode === 'T180'
    ? SUPPORTED_DEVICES_BY_NODE.T180
    : SUPPORTED_DEVICES_BY_NODE.T28;

const matchesT28Family = (device: string, familyPrefix: string): boolean =>
  device.startsWith(`${familyPrefix}_`);

const T28_DIGITAL_FAMILIES = new Set<string>([
  'PDDW16SDGZ',
  'PVDD1DGZ',
  'PVSS1DGZ',
  'PVDD2POC',
  'PVSS2DGZ',
]);

export const getSupportedDevicesForProcess = (
  processNode?: string,
): string[] => {
  const resolved = resolveProcessNode(processNode) || 'T180';
  return Array.from(SUPPORTED_DEVICES_BY_NODE[resolved]);
};

export const isSupportedDeviceForProcess = (
  processNode?: string,
  device?: string,
): boolean => {
  const resolved = resolveProcessNode(processNode);
  if (!resolved) return false;
  const normalizedDevice = normalizeDeviceName(device);
  if (!normalizedDevice) return false;
  return SUPPORTED_DEVICES_BY_NODE[resolved].has(normalizedDevice);
};

export const classifyDeviceForProcess = (
  processNode?: string,
  device?: string,
): DeviceClass => {
  const resolved = resolveProcessNode(processNode);
  const normalizedDevice = normalizeDeviceName(device);

  if (!resolved || !normalizedDevice) {
    return 'unsupported';
  }

  if (!SUPPORTED_DEVICES_BY_NODE[resolved].has(normalizedDevice)) {
    return 'unsupported';
  }

  if (resolved === 'T180') {
    if (T180_DIGITAL_STRICT_DEVICES.has(normalizedDevice)) {
      return 'digital';
    }
    if (T180_ANALOG_PREFERRED_DEVICES.has(normalizedDevice)) {
      return 'analog';
    }
    // T180 devices like PVDD1CDG/PVSS1CDG/PVDD2CDG/PVSS2CDG can be context-dependent.
    return 'unsupported';
  }

  const isT28Digital = Array.from(T28_DIGITAL_FAMILIES).some(family =>
    matchesT28Family(normalizedDevice, family),
  );
  return isT28Digital ? 'digital' : 'analog';
};

const resolveT28Labels = (profile: ProcessPinProfile): T28ResolvedLabels => ({
  analogPwrRef: profile.analog.regPwr || PIN_LABEL_FALLBACKS.analogPwr,
  analogGndRef: profile.analog.regGnd || PIN_LABEL_FALLBACKS.analogGnd,
  digitalVdd: profile.digital.regPwr || PIN_LABEL_FALLBACKS.digitalVdd,
  digitalVss: profile.digital.regGnd || PIN_LABEL_FALLBACKS.digitalVss,
  digitalVddPst: profile.digital.vdPwr || PIN_LABEL_FALLBACKS.digitalVddPst,
  digitalVssPst: profile.digital.vdGnd || PIN_LABEL_FALLBACKS.digitalVssPst,
});

const buildCoreName = (instanceName: string, fallback: string): string => {
  const name = String(instanceName || '').trim();
  return name ? `${name}_CORE` : `${fallback}_CORE`;
};

const matchesDeviceFamily = (device: string, familyPrefix: string): boolean =>
  device.startsWith(`${familyPrefix}_`);

type T28Builder = (
  instanceName: string,
  labels: T28ResolvedLabels,
) => PinConfigMap;

interface T28Rule {
  family: string;
  build: T28Builder;
}

const T28_RULES: T28Rule[] = [
  {
    family: 'PDB3AC',
    build: (instanceName, labels) => ({
      AIO: { label: instanceName || 'AIO' },
      TACVSS: { label: labels.analogGndRef },
      TACVDD: { label: labels.analogPwrRef },
      VSS: { label: labels.digitalVss },
    }),
  },
  {
    family: 'PVDD1AC',
    build: (instanceName, labels) => ({
      AVDD: { label: instanceName || 'AVDD' },
      TACVSS: { label: labels.analogGndRef },
      TACVDD: { label: labels.analogPwrRef },
      VSS: { label: labels.digitalVss },
    }),
  },
  {
    family: 'PVSS1AC',
    build: (instanceName, labels) => ({
      AVSS: { label: instanceName || 'AVSS' },
      TACVSS: { label: labels.analogGndRef },
      TACVDD: { label: labels.analogPwrRef },
      VSS: { label: labels.digitalVss },
    }),
  },
  {
    family: 'PVDD3AC',
    build: (instanceName, labels) => ({
      AVDD: { label: buildCoreName(instanceName, 'AVDD') },
      TACVSS: { label: labels.analogGndRef },
      TACVDD: { label: instanceName || labels.analogPwrRef },
      VSS: { label: labels.digitalVss },
    }),
  },
  {
    family: 'PVSS3AC',
    build: (instanceName, labels) => ({
      AVSS: { label: buildCoreName(instanceName, 'AVSS') },
      TACVSS: { label: instanceName || labels.analogGndRef },
      TACVDD: { label: labels.analogPwrRef },
      VSS: { label: labels.digitalVss },
    }),
  },
  {
    family: 'PVDD3A',
    build: (instanceName, labels) => ({
      AVDD: { label: buildCoreName(instanceName, 'AVDD') },
      TAVSS: { label: labels.analogGndRef },
      TAVDD: { label: instanceName || labels.analogPwrRef },
      VSS: { label: labels.digitalVss },
    }),
  },
  {
    family: 'PVSS3A',
    build: (instanceName, labels) => ({
      AVSS: { label: buildCoreName(instanceName, 'AVSS') },
      TAVSS: { label: instanceName || labels.analogGndRef },
      TAVDD: { label: labels.analogPwrRef },
      VSS: { label: labels.digitalVss },
    }),
  },
];

const buildT28DigitalPinConfig = (labels: T28ResolvedLabels): PinConfigMap => ({
  VDD: { label: labels.digitalVdd },
  VSS: { label: labels.digitalVss },
  VDDPST: { label: labels.digitalVddPst },
  VSSPST: { label: labels.digitalVssPst },
});

const buildT28PinConfig = (
  device: string,
  instanceName: string,
  profile: ProcessPinProfile,
): PinConfigMap | null => {
  const labels = resolveT28Labels(profile);

  for (const rule of T28_RULES) {
    if (matchesDeviceFamily(device, rule.family)) {
      return rule.build(instanceName, labels);
    }
  }

  const isDigitalFamily = Array.from(T28_DIGITAL_FAMILIES).some(family =>
    matchesDeviceFamily(device, family),
  );
  if (isDigitalFamily) {
    return buildT28DigitalPinConfig(labels);
  }

  return null;
};

const resolveProfile = (
  processNode?: string,
  pinConfigProfiles?: Record<string, ProcessPinProfile>,
): ProcessPinProfile | null => {
  const resolvedNode = String(processNode || 'T180').toUpperCase();
  const resolvedProcessNode = resolveProcessNode(resolvedNode);
  const externalProfile =
    pinConfigProfiles && pinConfigProfiles[resolvedNode]
      ? pinConfigProfiles[resolvedNode]
      : null;

  if (externalProfile?.analog && externalProfile?.digital) {
    return externalProfile;
  }

  if (!resolvedProcessNode) {
    return null;
  }

  return PROCESS_DEFAULTS[resolvedProcessNode] || null;
};

const SELF_NAME_PIN_BY_DEVICE: Record<string, string> = {
  PVDD1ANA: 'AVDD',
  PVSS1ANA: 'AVSS',
  PVDD1CDG: 'VDD',
  PVSS1CDG: 'VSS',
  PVDD2CDG: 'VDDPST',
  PVSS2CDG: 'VSSPST',
};

const withSelfNamePins = (
  device: string,
  instanceName: string,
  pinConfig: PinConfigMap,
): PinConfigMap => {
  if (!instanceName) return pinConfig;

  const targetPin = SELF_NAME_PIN_BY_DEVICE[device];
  if (!targetPin) return pinConfig;
  return {
    ...pinConfig,
    [targetPin]: { label: instanceName },
  };
};

export const buildPinConfigTemplate = (
  options: BuildPinConfigOptions,
): PinConfigMap | null => {
  const resolvedNode = String(options.processNode || 'T180').toUpperCase();
  const device = String(options.device || '').toUpperCase();
  const instanceName = String(options.instanceName || '').trim();
  const supportedDevices = getSupportedDevices(resolvedNode);

  if (!supportedDevices.has(device)) {
    return null;
  }

  const profile = resolveProfile(resolvedNode, options.pinConfigProfiles);
  if (!profile) {
    return null;
  }

  if (resolvedNode === 'T28') {
    return buildT28PinConfig(device, instanceName, profile);
  }

  const domain = resolveDomain(options.domain);
  const labels = domain === 'digital' ? profile.digital : profile.analog;

  const base: PinConfigMap = {
    VDD: { label: labels.regPwr },
    VSS: { label: labels.regGnd },
    VDDPST: { label: labels.vdPwr },
    VSSPST: { label: labels.vdGnd },
  };

  return withSelfNamePins(device, instanceName, base);
};

export const supportedProcessNodes = (): string[] =>
  Object.keys(PROCESS_DEFAULTS);
