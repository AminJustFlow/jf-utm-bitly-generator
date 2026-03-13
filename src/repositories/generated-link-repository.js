export class GeneratedLinkRepository {
  constructor(database) {
    this.database = database;
  }

  findByFingerprint(fingerprint) {
    return this.database.prepare("SELECT * FROM generated_links WHERE fingerprint = :fingerprint LIMIT 1")
      .get({ fingerprint }) ?? null;
  }

  create(payload) {
    const result = this.database.prepare(`
      INSERT INTO generated_links (
        fingerprint,
        client,
        channel,
        asset_type,
        normalized_destination_url,
        canonical_campaign,
        final_long_url,
        short_url,
        qr_url,
        bitly_id,
        bitly_payload,
        created_at,
        updated_at
      ) VALUES (
        :fingerprint,
        :client,
        :channel,
        :asset_type,
        :normalized_destination_url,
        :canonical_campaign,
        :final_long_url,
        :short_url,
        :qr_url,
        :bitly_id,
        :bitly_payload,
        :created_at,
        :updated_at
      )
    `).run({
      fingerprint: payload.fingerprint,
      client: payload.client,
      channel: payload.channel,
      asset_type: payload.assetType,
      normalized_destination_url: payload.normalizedDestinationUrl,
      canonical_campaign: payload.canonicalCampaign,
      final_long_url: payload.finalLongUrl,
      short_url: payload.shortUrl,
      qr_url: payload.qrUrl ?? null,
      bitly_id: payload.bitlyId ?? null,
      bitly_payload: JSON.stringify(payload.bitlyPayload ?? {}),
      created_at: payload.createdAt,
      updated_at: payload.updatedAt
    });

    return Number(result.lastInsertRowid);
  }

  updateByFingerprint(fingerprint, fields) {
    const payload = {
      ...fields,
      updated_at: fields.updated_at ?? new Date().toISOString()
    };
    const assignments = Object.keys(payload).map((field) => `${field} = :${field}`).join(", ");
    const values = { fingerprint };

    Object.entries(payload).forEach(([key, value]) => {
      values[key] = key === "bitly_payload"
        ? JSON.stringify(value ?? {})
        : value;
    });

    this.database.prepare(`UPDATE generated_links SET ${assignments} WHERE fingerprint = :fingerprint`)
      .run(values);
  }
}
