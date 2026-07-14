import { describe, expect, it } from 'vitest';

import {
  matchHmsAddress,
  matchHmsNamedPlace,
  type HmsAddressRecord
} from '../../../scripts/launch-inventory/hms-addresses';

const addressRecords: HmsAddressRecord[] = [
  {
    coordinateId: 1,
    postalCode: '101',
    streetName: 'Hverfisgata',
    houseNumber: 16,
    houseLetter: 'A',
    displayAddress: 'Hverfisgata 16A',
    latitude: 64.1469580016501,
    longitude: -21.9323232922102,
    coordinateType: 2,
    reviewStatus: 1
  },
  {
    coordinateId: 2,
    postalCode: '101',
    streetName: 'Lokastígur',
    houseNumber: 28,
    houseLetter: null,
    displayAddress: 'Lokastígur 28',
    latitude: 64.1424617796069,
    longitude: -21.9289048827688,
    coordinateType: 2,
    reviewStatus: 0
  },
  {
    coordinateId: 3,
    postalCode: '101',
    streetName: 'Lokastígur',
    houseNumber: 28,
    houseLetter: 'A',
    displayAddress: 'Lokastígur 28A',
    latitude: 64.1424015983036,
    longitude: -21.9289601815925,
    coordinateType: 2,
    reviewStatus: 1
  },
  {
    coordinateId: 4,
    postalCode: '170',
    streetName: 'Eiðistorg',
    houseNumber: 13,
    houseLetter: null,
    displayAddress: 'Eiðistorg 13',
    latitude: 64.1506673729424,
    longitude: -21.9845525209767,
    coordinateType: 2,
    reviewStatus: 1
  },
  {
    coordinateId: 5,
    postalCode: '170',
    streetName: 'Eiðistorg',
    houseNumber: 15,
    houseLetter: null,
    displayAddress: 'Eiðistorg 15',
    latitude: 64.1506572122241,
    longitude: -21.9850450957729,
    coordinateType: 2,
    reviewStatus: 1
  },
  {
    coordinateId: 6,
    postalCode: '170',
    streetName: 'Ráðagerði',
    houseNumber: null,
    houseLetter: null,
    locationQualifier: null,
    displayAddress: 'Ráðagerði',
    latitude: 64.1611625198295,
    longitude: -22.0087070383134,
    coordinateType: 0,
    reviewStatus: 0
  },
  {
    coordinateId: 7,
    postalCode: '276',
    streetName: 'Hjalli',
    houseNumber: null,
    houseLetter: null,
    locationQualifier: null,
    displayAddress: 'Hjalli',
    latitude: 64.3044246334551,
    longitude: -21.5417687788847,
    coordinateType: 0,
    reviewStatus: 0
  },
  {
    coordinateId: 8,
    postalCode: '276',
    streetName: 'Hjalli',
    houseNumber: null,
    houseLetter: null,
    locationQualifier: null,
    displayAddress: 'Hjalli',
    latitude: 64.3046082166234,
    longitude: -21.5420018640767,
    coordinateType: 0,
    reviewStatus: 0
  }
];

describe('HMS named-place matching', () => {
  it('resolves a unique exact named place in the requested postal code', () => {
    expect(matchHmsNamedPlace({ name: 'Ráðagerði', postalCode: '170' }, addressRecords)).toEqual({
      status: 'resolved',
      latitude: 64.1611625198295,
      longitude: -22.0087070383134,
      coordinateIds: [6],
      matchedAddresses: ['Ráðagerði']
    });
  });

  it('fails closed when an exact named place has multiple official points', () => {
    expect(matchHmsNamedPlace({ name: 'Hjalli', postalCode: '276' }, addressRecords)).toEqual({
      status: 'unresolved',
      reason: 'ambiguous_match'
    });
  });
});

describe('HMS address matching', () => {
  it('resolves an exact numbered address including its house letter', () => {
    expect(
      matchHmsAddress({ addressLine: 'Hverfisgata 16a', postalCode: '101' }, addressRecords)
    ).toEqual({
      status: 'resolved',
      latitude: 64.1469580016501,
      longitude: -21.9323232922102,
      coordinateIds: [1],
      matchedAddresses: ['Hverfisgata 16A']
    });
  });

  it('prefers the exact unsuffixed building over a suffixed neighbour', () => {
    expect(
      matchHmsAddress({ addressLine: 'Lokastígur 28', postalCode: '101' }, addressRecords)
    ).toMatchObject({
      status: 'resolved',
      coordinateIds: [2],
      matchedAddresses: ['Lokastígur 28']
    });
  });

  it('uses the centroid of every exact address in an explicit range', () => {
    expect(
      matchHmsAddress({ addressLine: 'Eiðistorg 13-15', postalCode: '170' }, addressRecords)
    ).toEqual({
      status: 'resolved',
      latitude: (64.1506673729424 + 64.1506572122241) / 2,
      longitude: (-21.9845525209767 + -21.9850450957729) / 2,
      coordinateIds: [4, 5],
      matchedAddresses: ['Eiðistorg 13', 'Eiðistorg 15']
    });
  });

  it('fails closed when the source contains only a street name', () => {
    expect(
      matchHmsAddress({ addressLine: 'Hofsvallagata', postalCode: '107' }, addressRecords)
    ).toEqual({ status: 'unresolved', reason: 'address_number_missing' });
  });

  it('fails closed when equally preferred reviewed records disagree on the point', () => {
    const duplicate = {
      ...addressRecords[0],
      coordinateId: 101,
      latitude: addressRecords[0].latitude + 0.001
    };

    expect(
      matchHmsAddress({ addressLine: 'Hverfisgata 16a', postalCode: '101' }, [
        ...addressRecords,
        duplicate
      ])
    ).toEqual({ status: 'unresolved', reason: 'ambiguous_match' });
  });

  it('never lets an unknown coordinate type outrank a supported point type', () => {
    const unknownType = {
      ...addressRecords[1],
      coordinateId: 102,
      coordinateType: 99,
      latitude: addressRecords[1].latitude + 0.001
    };

    expect(
      matchHmsAddress({ addressLine: 'Lokastígur 28', postalCode: '101' }, [
        ...addressRecords,
        unknownType
      ])
    ).toMatchObject({ status: 'resolved', coordinateIds: [2] });
  });
});
