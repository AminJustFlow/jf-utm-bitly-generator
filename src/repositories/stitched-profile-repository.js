export class StitchedProfileRepository {
  constructor(database) {
    this.database = database;
  }

  createProfile(clientId, timestamp = new Date().toISOString()) {
    const result = this.database.prepare(`
      INSERT INTO stitched_profiles (
        client_id,
        created_at,
        updated_at
      ) VALUES (
        :client_id,
        :created_at,
        :updated_at
      )
    `).run({
      client_id: clientId,
      created_at: timestamp,
      updated_at: timestamp
    });

    return Number(result.lastInsertRowid);
  }

  findProfilesByIdentities(clientId, identities) {
    if (!Array.isArray(identities) || identities.length === 0) {
      return [];
    }

    const conditions = [];
    const params = {
      client_id: clientId
    };

    identities.forEach((identity, index) => {
      params[`identity_type_${index}`] = identity.identityType;
      params[`identity_hash_${index}`] = identity.identityHash;
      conditions.push(`(identity_type = :identity_type_${index} AND identity_hash = :identity_hash_${index})`);
    });

    return this.database.prepare(`
      SELECT *
      FROM stitched_profile_identities
      WHERE client_id = :client_id
        AND (${conditions.join(" OR ")})
      ORDER BY profile_id ASC, id ASC
    `).all(params);
  }

  linkIdentity(profileId, clientId, identityType, identityHash, timestamp = new Date().toISOString()) {
    this.database.prepare(`
      INSERT OR IGNORE INTO stitched_profile_identities (
        profile_id,
        client_id,
        identity_type,
        identity_hash,
        created_at,
        updated_at
      ) VALUES (
        :profile_id,
        :client_id,
        :identity_type,
        :identity_hash,
        :created_at,
        :updated_at
      )
    `).run({
      profile_id: profileId,
      client_id: clientId,
      identity_type: identityType,
      identity_hash: identityHash,
      created_at: timestamp,
      updated_at: timestamp
    });
  }

  mergeProfiles(canonicalProfileId, duplicateProfileIds, timestamp = new Date().toISOString()) {
    const duplicateIds = normalizeIds(duplicateProfileIds)
      .filter((profileId) => profileId !== Number(canonicalProfileId));
    if (duplicateIds.length === 0) {
      return;
    }

    const placeholders = duplicateIds.join(", ");
    this.database.prepare(`
      INSERT OR IGNORE INTO stitched_profile_identities (
        profile_id,
        client_id,
        identity_type,
        identity_hash,
        created_at,
        updated_at
      )
      SELECT
        :canonical_profile_id,
        client_id,
        identity_type,
        identity_hash,
        created_at,
        :updated_at
      FROM stitched_profile_identities
      WHERE profile_id IN (${placeholders})
    `).run({
      canonical_profile_id: canonicalProfileId,
      updated_at: timestamp
    });

    this.database.prepare(`
      DELETE FROM stitched_profile_identities
      WHERE profile_id IN (${placeholders})
    `).run();

    this.database.prepare(`
      UPDATE visitors
      SET stitched_profile_id = :canonical_profile_id
      WHERE stitched_profile_id IN (${placeholders})
    `).run({
      canonical_profile_id: canonicalProfileId
    });

    this.database.prepare(`
      DELETE FROM stitched_profiles
      WHERE id IN (${placeholders})
    `).run();

    this.database.prepare(`
      UPDATE stitched_profiles
      SET updated_at = :updated_at
      WHERE id = :canonical_profile_id
    `).run({
      canonical_profile_id: canonicalProfileId,
      updated_at: timestamp
    });
  }
}

function normalizeIds(values) {
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}
