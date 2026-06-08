/**
 * Demo signer profile — mirrors signOffer.blade.php orgSignature, orgName, etc.
 */
export const DEMO_PROFILES = {
  party_1: {
    party: 'party_1',
    signatureType: 1,
    signature: 'Alex Rivera',
    signatureImageUrl: '',
    initials: 'AR',
    name: 'Alex Rivera',
    company: 'Rivera Live LLC',
    title: 'Tour Manager',
  },
  party_2: {
    party: 'party_2',
    signatureType: 1,
    signature: 'Jordan Lee',
    signatureImageUrl: '',
    initials: 'JL',
    name: 'Jordan Lee',
    company: 'Metro Events Co.',
    title: 'Promoter',
  },
};

export function getProfile(partyId) {
  return DEMO_PROFILES[partyId] || DEMO_PROFILES.party_1;
}

export function formatToday() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Value used when a placeholder is clicked (sign mode).
 */
export function getFillValue(fieldType, profile) {
  if (!profile) {
    return '';
  }

  switch (fieldType) {
    case 'signature':
      if (profile.signatureType === 3 && profile.signatureImageUrl) {
        return { type: 'image', value: profile.signatureImageUrl };
      }
      return { type: 'text', value: profile.signature || '', large: true };
    case 'initial':
      return { type: 'text', value: profile.initials || '' };
    case 'date':
      return { type: 'text', value: formatToday() };
    case 'name':
      return { type: 'text', value: profile.name || '' };
    case 'company':
      return { type: 'text', value: profile.company || '' };
    case 'title':
      return { type: 'text', value: profile.title || '' };
    default:
      return { type: 'text', value: '' };
  }
}
