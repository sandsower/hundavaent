import type {
  AccessArea,
  AvailabilityState,
  AvailabilityWindow,
  DogEligibility,
  PermissionRequirement,
  RestraintCondition
} from './access';

export type AccessSymbolDimension = 'area' | 'restraint' | 'permission' | 'dogs' | 'timing';
export type AccessSymbolState =
  | 'indoors'
  | 'leash_required'
  | 'off_leash_permitted'
  | 'carrier_required'
  | 'small_dogs_only'
  | 'limited'
  | 'unrestricted'
  | 'special'
  | 'not_stated';

export interface AccessSymbolCondition {
  accessArea: AccessArea;
  restraintCondition: RestraintCondition;
  permissionRequirement: PermissionRequirement;
  dogEligibility?: DogEligibility;
  availabilityState?: AvailabilityState;
  availabilityWindow?: AvailabilityWindow;
}

export interface AccessSymbol {
  dimension: AccessSymbolDimension;
  state: AccessSymbolState;
}

export type AccessSymbolPresentation =
  | {
      kind: 'simple';
      symbols: [AccessSymbol, AccessSymbol, AccessSymbol, AccessSymbol, AccessSymbol];
    }
  | { kind: 'complex'; conditionCount: number };

export function buildAccessSymbolPresentation(
  conditions: readonly AccessSymbolCondition[]
): AccessSymbolPresentation {
  if (conditions.length !== 1) {
    return { kind: 'complex', conditionCount: conditions.length };
  }

  const condition = conditions[0];
  return {
    kind: 'simple',
    symbols: [
      { dimension: 'area', state: areaState(condition.accessArea) },
      { dimension: 'restraint', state: restraintState(condition.restraintCondition) },
      { dimension: 'permission', state: permissionState(condition.permissionRequirement) },
      { dimension: 'dogs', state: dogState(condition.dogEligibility) },
      {
        dimension: 'timing',
        state: timingState(condition.availabilityState ?? 'not_stated')
      }
    ]
  };
}

function areaState(area: AccessArea): AccessSymbolState {
  return area === 'indoors' ? 'indoors' : 'special';
}

function restraintState(restraint: RestraintCondition): AccessSymbolState {
  return restraint === 'other_sourced' ? 'special' : restraint;
}

function permissionState(permission: PermissionRequirement): AccessSymbolState {
  return permission === 'standing_permission' ? 'unrestricted' : 'special';
}

function dogState(eligibility: DogEligibility | undefined): AccessSymbolState {
  if (!eligibility) return 'not_stated';
  if (eligibility.scope === 'all_dogs') return 'unrestricted';
  if (eligibility.maximumWeightKg !== undefined) return 'small_dogs_only';
  return 'special';
}

function timingState(state: AvailabilityState): AccessSymbolState {
  if (state === 'whenever_open') return 'unrestricted';
  return state;
}
