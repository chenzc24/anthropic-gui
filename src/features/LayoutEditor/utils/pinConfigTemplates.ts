type DomainType = 'analog' | 'digital';

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

const PROCESS_DEFAULTS: Record<string, ProcessPinProfile> = {
  T180: DEFAULT_T180_PROFILE,
};

const T180_SUPPORTED_DEVICES = new Set([
  'PVDD1ANA',
  'PVSS1ANA',
  'PVDD1CDG',
  'PVSS1CDG',
  'PVDD2CDG',
  'PVSS2CDG',
  'PDDW0412SCDG',
]);

const resolveDomain = (domain?: string | null): DomainType =>
  String(domain || '').toLowerCase() === 'digital' ? 'digital' : 'analog';

const resolveProfile = (
  processNode?: string,
  pinConfigProfiles?: Record<string, ProcessPinProfile>,
): ProcessPinProfile | null => {
  const resolvedNode = String(processNode || 'T180').toUpperCase();
  const externalProfile =
    pinConfigProfiles && pinConfigProfiles[resolvedNode]
      ? pinConfigProfiles[resolvedNode]
      : null;

  if (externalProfile?.analog && externalProfile?.digital) {
    return externalProfile;
  }

  return PROCESS_DEFAULTS[resolvedNode] || null;
};

const withSelfNamePins = (
  device: string,
  instanceName: string,
  pinConfig: PinConfigMap,
): PinConfigMap => {
  if (!instanceName) return pinConfig;

  if (device === 'PVDD1ANA') {
    return { ...pinConfig, AVDD: { label: instanceName } };
  }
  if (device === 'PVSS1ANA') {
    return { ...pinConfig, AVSS: { label: instanceName } };
  }
  if (device === 'PVDD1CDG') {
    return { ...pinConfig, VDD: { label: instanceName } };
  }
  if (device === 'PVSS1CDG') {
    return { ...pinConfig, VSS: { label: instanceName } };
  }
  if (device === 'PVDD2CDG') {
    return { ...pinConfig, VDDPST: { label: instanceName } };
  }
  if (device === 'PVSS2CDG') {
    return { ...pinConfig, VSSPST: { label: instanceName } };
  }
  return pinConfig;
};

export const buildPinConfigTemplate = (
  options: BuildPinConfigOptions,
): PinConfigMap | null => {
  const device = String(options.device || '').toUpperCase();
  if (!T180_SUPPORTED_DEVICES.has(device)) {
    return null;
  }

  const profile = resolveProfile(
    options.processNode,
    options.pinConfigProfiles,
  );
  if (!profile) {
    return null;
  }

  const domain = resolveDomain(options.domain);
  const labels = domain === 'digital' ? profile.digital : profile.analog;

  const base: PinConfigMap = {
    VDD: { label: labels.regPwr },
    VSS: { label: labels.regGnd },
    VDDPST: { label: labels.vdPwr },
    VSSPST: { label: labels.vdGnd },
  };

  return withSelfNamePins(device, String(options.instanceName || ''), base);
};

export const supportedProcessNodes = (): string[] =>
  Object.keys(PROCESS_DEFAULTS);
