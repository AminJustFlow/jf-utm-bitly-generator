import crypto from "node:crypto";
import { NormalizedLinkRequest } from "../domain/normalized-link-request.js";

const HEADER_ALIASES = new Map([
  ["date", "created_at"],
  ["creationdate", "created_at"],
  ["destinationurl", "destination_url"],
  ["source", "utm_source"],
  ["medium", "utm_medium"],
  ["campaignnamepromotionorcampaign", "utm_campaign"],
  ["campaigntermkeywordsrunningshoes", "utm_term"],
  ["campaigncontentabtesttosameurl", "utm_content"],
  ["utmstring", "final_long_url"],
  ["bitly", "short_url"],
  ["clientcode", "client_code"]
]);

export class TrackerImportService {
  constructor({
    workbookReader,
    requestRepository,
    generatedLinkRepository,
    rulesService,
    fingerprintService,
    urlService,
    qrCodeService
  }) {
    this.workbookReader = workbookReader;
    this.requestRepository = requestRepository;
    this.generatedLinkRepository = generatedLinkRepository;
    this.rulesService = rulesService;
    this.fingerprintService = fingerprintService;
    this.urlService = urlService;
    this.qrCodeService = qrCodeService;
  }

  importFiles(files = []) {
    const normalizedFiles = Array.isArray(files) ? files : [];
    const results = normalizedFiles.map((file) => this.importFile(file));

    return {
      files: results,
      summary: {
        attempted: results.reduce((sum, entry) => sum + entry.summary.attempted, 0),
        imported: results.reduce((sum, entry) => sum + entry.summary.imported, 0),
        skipped: results.reduce((sum, entry) => sum + entry.summary.skipped, 0),
        errors: results.reduce((sum, entry) => sum + entry.summary.errors, 0)
      }
    };
  }

  getImportInventory() {
    return {
      importedRequests: this.requestRepository.countImportedRequests(),
      importedGeneratedLinks: this.generatedLinkRepository.countImportedLinks()
    };
  }

  importFile(file) {
    const fileName = String(file?.name ?? "").trim() || "tracker.xlsx";
    const contentBase64 = String(file?.content_base64 ?? "").trim();
    if (!contentBase64) {
      return {
        fileName,
        ok: false,
        message: "No workbook content was provided.",
        summary: {
          attempted: 0,
          imported: 0,
          skipped: 0,
          errors: 1
        },
        sheets: []
      };
    }

    try {
      const workbook = this.workbookReader.read(Buffer.from(contentBase64, "base64"));
      return this.importWorkbook(fileName, workbook);
    } catch (error) {
      return {
        fileName,
        ok: false,
        message: error.message,
        summary: {
          attempted: 0,
          imported: 0,
          skipped: 0,
          errors: 1
        },
        sheets: []
      };
    }
  }

  importWorkbook(fileName, workbook) {
    const sheetResults = [];
    let attempted = 0;
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const sheet of workbook.sheets) {
      if (shouldSkipSheet(sheet.name)) {
        continue;
      }

      const header = mapHeaderRow(sheet.rows[0] ?? []);
      if (!isImportSheet(header)) {
        continue;
      }

      const sheetResult = {
        name: sheet.name,
        attempted: 0,
        imported: 0,
        skipped: 0,
        errors: 0
      };

      for (let rowIndex = 1; rowIndex < sheet.rows.length; rowIndex += 1) {
        const row = mapDataRow(sheet.rows[rowIndex], header);
        if (!row.destination_url && !row.utm_source && !row.utm_campaign) {
          continue;
        }

        attempted += 1;
        sheetResult.attempted += 1;

        const outcome = this.importRow({
          fileName,
          sheetName: sheet.name,
          rowNumber: rowIndex + 1,
          row
        });

        if (outcome.status === "imported") {
          imported += 1;
          sheetResult.imported += 1;
          continue;
        }

        if (outcome.status === "skipped") {
          skipped += 1;
          sheetResult.skipped += 1;
          continue;
        }

        errors += 1;
        sheetResult.errors += 1;
      }

      sheetResults.push(sheetResult);
    }

    return {
      fileName,
      ok: true,
      message: imported > 0
        ? `Imported ${imported} row(s) from ${fileName}.`
        : `No importable rows were found in ${fileName}.`,
      summary: {
        attempted,
        imported,
        skipped,
        errors
      },
      sheets: sheetResults
    };
  }

  importRow({ fileName, sheetName, rowNumber, row }) {
    const destinationUrl = normalizeOptional(row.destination_url);
    const utmSource = normalizeNullable(row.utm_source);
    const utmMedium = normalizeNullable(row.utm_medium);
    const utmCampaign = normalizeNullable(row.utm_campaign);
    const utmTerm = normalizeNullable(row.utm_term) ?? "";
    const utmContent = normalizeNullable(row.utm_content) ?? "";
    const shortUrl = normalizeOptional(row.short_url);
    const client = this.resolveClient(row.client_code, sheetName, destinationUrl);

    if (!destinationUrl || !utmSource || !utmMedium || !utmCampaign || !client) {
      return { status: "error" };
    }

    let normalizedDestinationUrl;
    try {
      normalizedDestinationUrl = this.urlService.normalizeDestination(destinationUrl);
    } catch {
      return { status: "error" };
    }

    const channel = this.resolveChannel(client, utmSource, utmMedium);
    const assetType = this.resolveAssetType(channel, utmSource, utmMedium);
    const finalLongUrl = this.urlService.appendUtms(normalizedDestinationUrl, {
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_term: utmTerm,
      utm_content: utmContent
    });
    const needsQr = channel === "qr" || normalizeComparable(utmMedium) === "qrcode";
    const qrUrl = needsQr
      ? this.qrCodeService.generateUrl(shortUrl || finalLongUrl)
      : null;

    const normalized = new NormalizedLinkRequest({
      client,
      clientDisplayName: this.rulesService.getClientDisplayName(client),
      channel,
      channelDisplayName: this.rulesService.getChannelDisplayName(channel),
      assetType,
      campaignLabel: utmCampaign,
      canonicalCampaign: utmCampaign,
      destinationUrl,
      normalizedDestinationUrl,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      finalLongUrl,
      needsQr,
      confidence: 1,
      warnings: []
    });
    const fingerprint = this.fingerprintService.generate(normalized);
    const deliveryKey = `import:${hashImportSignature({
      client,
      normalizedDestinationUrl,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      shortUrl
    })}`;
    const existingRequest = this.requestRepository.findLatestByFingerprint(fingerprint);
    const existingGenerated = this.generatedLinkRepository.findByFingerprint(fingerprint);

    if (existingRequest || this.requestRepository.findByDeliveryKey(deliveryKey)) {
      this.synchronizeDuplicateImport({
        existingRequest,
        existingGenerated,
        fingerprint,
        normalized,
        shortUrl,
        qrUrl,
        createdAt: parseImportedDate(row.created_at) ?? new Date().toISOString(),
        importContext: {
          fileName,
          sheetName,
          rowNumber
        }
      });
      return { status: "skipped" };
    }

    const createdAt = parseImportedDate(row.created_at) ?? new Date().toISOString();
    const requestId = this.requestRepository.createIncoming({
      deliveryKey,
      status: "received",
      originalMessage: `Imported from ${fileName} (${sheetName} row ${rowNumber}) | Client: ${normalized.clientDisplayName} | Campaign: ${utmCampaign} | Destination: ${destinationUrl}`,
      rawPayload: {
        source: "xlsx_import",
        file_name: fileName,
        sheet_name: sheetName,
        row_number: rowNumber,
        imported_values: row
      },
      sourceUserId: "xlsx_import",
      sourceUserName: "XLSX Import",
      createdAt,
      updatedAt: createdAt
    });

    this.requestRepository.update(requestId, {
      status: "parsed",
      parsed_payload: {
        client,
        channel,
        destination_url: destinationUrl,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        utm_term: utmTerm,
        utm_content: utmContent,
        imported_from: {
          file_name: fileName,
          sheet_name: sheetName,
          row_number: rowNumber
        }
      },
      warnings: [],
      missing_fields: []
    });

    this.requestRepository.update(requestId, {
      status: "normalized",
      normalized_payload: normalized.toJSON(),
      fingerprint,
      final_long_url: finalLongUrl
    });

    const reusedExisting = Boolean(existingGenerated);

    if (shortUrl) {
      if (!existingGenerated) {
        this.generatedLinkRepository.create({
          fingerprint,
          client,
          channel,
          assetType,
          normalizedDestinationUrl,
          canonicalCampaign: utmCampaign,
          finalLongUrl,
          shortUrl,
          qrUrl,
          bitlyId: null,
          bitlyPayload: {
            imported: true,
            file_name: fileName,
            sheet_name: sheetName,
            row_number: rowNumber
          },
          createdAt,
          updatedAt: createdAt
        });
      } else if (!existingGenerated.qr_url && qrUrl) {
        this.generatedLinkRepository.updateByFingerprint(fingerprint, {
          qr_url: qrUrl
        });
      }
    }

    this.requestRepository.update(requestId, {
      status: shortUrl ? "completed" : "completed_without_short_link",
      normalized_payload: normalized.toJSON(),
      short_url: shortUrl,
      qr_url: qrUrl,
      reused_existing: reusedExisting ? 1 : 0,
      warnings: []
    });

    return { status: "imported" };
  }

  synchronizeDuplicateImport({
    existingRequest,
    existingGenerated,
    fingerprint,
    normalized,
    shortUrl,
    qrUrl,
    createdAt,
    importContext
  }) {
    if (shortUrl) {
      if (!existingGenerated) {
        this.generatedLinkRepository.create({
          fingerprint,
          client: normalized.client,
          channel: normalized.channel,
          assetType: normalized.assetType,
          normalizedDestinationUrl: normalized.normalizedDestinationUrl,
          canonicalCampaign: normalized.canonicalCampaign,
          finalLongUrl: normalized.finalLongUrl,
          shortUrl,
          qrUrl,
          bitlyId: null,
          bitlyPayload: {
            imported: true,
            file_name: importContext.fileName,
            sheet_name: importContext.sheetName,
            row_number: importContext.rowNumber
          },
          createdAt,
          updatedAt: createdAt
        });
      } else {
        const generatedUpdates = {};
        if (!existingGenerated.short_url) {
          generatedUpdates.short_url = shortUrl;
        }
        if (!existingGenerated.qr_url && qrUrl) {
          generatedUpdates.qr_url = qrUrl;
        }
        if (Object.keys(generatedUpdates).length > 0) {
          this.generatedLinkRepository.updateByFingerprint(fingerprint, generatedUpdates);
        }
      }
    } else if (existingGenerated && !existingGenerated.qr_url && qrUrl) {
      this.generatedLinkRepository.updateByFingerprint(fingerprint, {
        qr_url: qrUrl
      });
    }

    if (!existingRequest) {
      return;
    }

    const requestUpdates = {};
    if (!normalizeOptional(existingRequest.short_url) && shortUrl) {
      requestUpdates.short_url = shortUrl;
      requestUpdates.status = "completed";
    }
    if (!normalizeOptional(existingRequest.qr_url) && qrUrl) {
      requestUpdates.qr_url = qrUrl;
    }
    if (Object.keys(requestUpdates).length > 0) {
      this.requestRepository.update(existingRequest.id, requestUpdates);
    }
  }

  resolveClient(clientCode, sheetName, destinationUrl) {
    return this.rulesService.normalizeClient(normalizeClientCode(clientCode), destinationUrl)
      ?? this.rulesService.normalizeClient(sheetName, destinationUrl)
      ?? this.rulesService.normalizeClient(clientCode, destinationUrl)
      ?? null;
  }

  resolveChannel(client, source, medium) {
    return this.rulesService.normalizeChannel(null, null, false, {
      client,
      source,
      medium
    }) ?? fallbackChannel(source, medium);
  }

  resolveAssetType(channel, source, medium) {
    return this.rulesService.normalizeAssetType(null, channel, {
      source,
      medium
    }) ?? fallbackAssetType(medium, channel);
  }

  resetImports() {
    const fingerprints = [...new Set(this.requestRepository.listImportedFingerprints())];
    const deletedRequests = this.requestRepository.deleteImportedRequests();
    let deletedGeneratedLinks = 0;

    fingerprints.forEach((fingerprint) => {
      if (!fingerprint || this.requestRepository.countByFingerprint(fingerprint) > 0) {
        return;
      }

      const generated = this.generatedLinkRepository.findByFingerprint(fingerprint);
      if (!generated || !isImportedGeneratedLink(generated)) {
        return;
      }

      deletedGeneratedLinks += this.generatedLinkRepository.deleteByFingerprint(fingerprint);
    });

    return {
      deletedRequests,
      deletedGeneratedLinks
    };
  }
}

function mapHeaderRow(cells) {
  return Object.fromEntries(cells.map((cell) => {
    return [cell.column, HEADER_ALIASES.get(normalizeComparable(cell.value)) ?? null];
  }));
}

function mapDataRow(cells, header) {
  const row = {};

  cells.forEach((cell) => {
    const key = header[cell.column];
    if (key) {
      row[key] = cell.value;
    }
  });

  return row;
}

function isImportSheet(header) {
  const keys = new Set(Object.values(header).filter(Boolean));
  return keys.has("destination_url")
    && keys.has("utm_source")
    && keys.has("utm_medium")
    && keys.has("utm_campaign");
}

function shouldSkipSheet(name) {
  const normalized = normalizeComparable(name);
  return ["all", "campaigns", "values", "practicetab"].includes(normalized)
    || /^sheet\d+$/u.test(normalized);
}

function normalizeClientCode(value) {
  const normalized = String(value ?? "").trim();
  return normalized.replace(/\.0$/u, "");
}

function parseImportedDate(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{2})(\d{2})(\d{2})(?:\.0)?$/u);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return new Date(Date.UTC(2000 + year, month - 1, day, 12, 0, 0)).toISOString();
}

function hashImportSignature(payload) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function fallbackChannel(source, medium) {
  const normalizedMedium = normalizeComparable(medium);
  if (normalizedMedium === "email" || normalizedMedium === "sms") {
    return "email";
  }
  if (normalizedMedium === "qrcode") {
    return "qr";
  }
  if (normalizedMedium === "pressrelease") {
    return "pr";
  }
  if (normalizedMedium === "website") {
    return "website";
  }
  if (normalizedMedium === "domain") {
    return "domain";
  }
  if (normalizedMedium === "social" && source) {
    return normalizeComparable(source);
  }

  return normalizeComparable(source || medium || "imported");
}

function fallbackAssetType(medium, channel) {
  const normalizedMedium = normalizeComparable(medium);
  if (normalizedMedium === "email" || normalizedMedium === "sms") {
    return "email";
  }
  if (normalizedMedium === "qrcode") {
    return "offline";
  }
  if (normalizedMedium === "pressrelease") {
    return "pr";
  }
  if (normalizedMedium === "website" || normalizedMedium === "domain") {
    return "owned";
  }
  if (normalizedMedium === "social") {
    return "social";
  }
  if (channel === "qr") {
    return "offline";
  }

  return "social";
}

function normalizeOptional(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function normalizeNullable(value) {
  if (value === undefined || value === null) {
    return null;
  }

  return String(value).trim();
}

function normalizeComparable(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "");
}

function isImportedGeneratedLink(row) {
  try {
    const payload = JSON.parse(row?.bitly_payload ?? "{}");
    return Boolean(payload?.imported);
  } catch {
    return false;
  }
}
