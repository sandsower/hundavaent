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
  | 'ask_on_arrival'
  | 'limited'
  | 'unrestricted'
  | 'special'
  | 'not_stated';

export interface AccessSymbolCondition {
  accessArea: AccessArea;
  accessAreaNote?: string | null;
  restraintCondition: RestraintCondition;
  restraintNote?: string | null;
  permissionRequirement: PermissionRequirement;
  dogEligibility?: DogEligibility;
  dogEligibilityState?: 'all_dogs' | 'small_dogs_only' | 'special' | 'not_stated';
  availabilityState?: AvailabilityState;
  availabilityWindow?: AvailabilityWindow;
}

export interface AccessSymbol {
  dimension: AccessSymbolDimension;
  state: AccessSymbolState;
  condition: AccessSymbolCondition;
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
      { dimension: 'area', state: areaState(condition.accessArea), condition },
      {
        dimension: 'restraint',
        state: restraintState(condition.restraintCondition),
        condition
      },
      {
        dimension: 'permission',
        state: permissionState(condition.permissionRequirement),
        condition
      },
      {
        dimension: 'dogs',
        state: dogState(condition.dogEligibility, condition.dogEligibilityState),
        condition
      },
      {
        dimension: 'timing',
        state: timingState(condition.availabilityState ?? 'not_stated'),
        condition
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
  if (permission === 'standing_permission') return 'unrestricted';
  if (permission === 'ask_on_arrival') return 'ask_on_arrival';
  return 'special';
}

function dogState(
  eligibility: DogEligibility | undefined,
  summaryState: AccessSymbolCondition['dogEligibilityState']
): AccessSymbolState {
  if (summaryState === 'all_dogs') return 'unrestricted';
  if (summaryState === 'small_dogs_only') return 'small_dogs_only';
  if (summaryState === 'special') return 'special';
  if (summaryState === 'not_stated') return 'not_stated';
  if (!eligibility) return 'not_stated';
  if (eligibility.scope === 'all_dogs') return 'unrestricted';
  if (eligibility.maximumWeightKg !== undefined) return 'small_dogs_only';
  return 'special';
}

function timingState(state: AvailabilityState): AccessSymbolState {
  if (state === 'whenever_open') return 'unrestricted';
  return state;
}
