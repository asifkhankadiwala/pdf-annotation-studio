/**
 * Contract document fields — mirrors TourCntrl Sidebar / controlerData.
 */
export const PARTIES = {
  party_1: {
    id: 'party_1',
    label: 'Performing Party',
    shortLabel: 'Party A',
    color: '#F55800',
    bgColor: 'rgba(245, 88, 0, 0.15)',
  },
  party_2: {
    id: 'party_2',
    label: 'Contracting Party',
    shortLabel: 'Party B',
    color: '#6F00FC',
    bgColor: 'rgba(111, 0, 252, 0.15)',
  },
};

export const FIELD_TYPES = {
  signature: {
    label: 'Signature',
    placeholder: 'x___________',
    widthPx: 170,
    heightPx: 40,
    largeText: true,
  },
  initial: {
    label: 'Initials',
    placeholder: 'SO',
    widthPx: 130,
    heightPx: 40,
  },
  date: {
    label: 'Date',
    placeholder: 'MM/DD/YYYY',
    widthPx: 160,
    heightPx: 40,
  },
  name: {
    label: 'Name',
    placeholder: 'Name',
    widthPx: 130,
    heightPx: 40,
  },
  company: {
    label: 'Company',
    placeholder: 'Company',
    widthPx: 130,
    heightPx: 40,
  },
  title: {
    label: 'Title',
    placeholder: 'Title',
    widthPx: 150,
    heightPx: 40,
  },
};

export function getParty(partyId) {
  return PARTIES[partyId] || PARTIES.party_1;
}

export function getFieldType(fieldType) {
  return FIELD_TYPES[fieldType] || null;
}

export function normalizedFieldSize(fieldType, layerWidth, layerHeight) {
  const cfg = getFieldType(fieldType);
  if (!cfg || !layerWidth) {
    return { width: 0.2, height: 0.05 };
  }
  return {
    width: Math.min(0.9, cfg.widthPx / layerWidth),
    height: Math.min(0.2, cfg.heightPx / (layerHeight || layerWidth * 1.4)),
  };
}
