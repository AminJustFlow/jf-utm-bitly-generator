export class IdentityStitchingService {
  constructor({
    visitorRepository,
    stitchedProfileRepository
  }) {
    this.visitorRepository = visitorRepository;
    this.stitchedProfileRepository = stitchedProfileRepository;
  }

  stitchVisitor(website, visitor, identity = {}, timestamp = new Date().toISOString()) {
    const clientId = Number(website?.client_id ?? 0);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      return null;
    }

    const identities = buildIdentityList(identity);
    if (identities.length === 0) {
      return visitor?.stitched_profile_id ? Number(visitor.stitched_profile_id) : null;
    }

    const existingProfiles = this.stitchedProfileRepository.findProfilesByIdentities(clientId, identities)
      .map((row) => Number(row.profile_id))
      .filter((profileId) => Number.isInteger(profileId) && profileId > 0);
    const uniqueProfiles = [...new Set(existingProfiles)].sort((left, right) => left - right);
    const canonicalProfileId = uniqueProfiles[0] ?? this.stitchedProfileRepository.createProfile(clientId, timestamp);

    if (uniqueProfiles.length > 1) {
      this.stitchedProfileRepository.mergeProfiles(canonicalProfileId, uniqueProfiles.slice(1), timestamp);
    }

    identities.forEach((entry) => {
      this.stitchedProfileRepository.linkIdentity(canonicalProfileId, clientId, entry.identityType, entry.identityHash, timestamp);
    });
    this.visitorRepository.assignStitchedProfile(visitor.id, canonicalProfileId, timestamp);

    return canonicalProfileId;
  }
}

function buildIdentityList(identity) {
  const entries = [];
  const emailHash = normalizeHash(identity.leadEmailHash);
  const phoneHash = normalizeHash(identity.leadPhoneHash);

  if (emailHash) {
    entries.push({
      identityType: "email_hash",
      identityHash: emailHash
    });
  }
  if (phoneHash) {
    entries.push({
      identityType: "phone_hash",
      identityHash: phoneHash
    });
  }

  return entries;
}

function normalizeHash(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}
