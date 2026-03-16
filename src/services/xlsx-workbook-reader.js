import zlib from "node:zlib";

export class XlsxWorkbookReader {
  read(buffer) {
    const zip = readZipEntries(buffer);
    const workbookXml = zip.get("xl/workbook.xml");
    const relsXml = zip.get("xl/_rels/workbook.xml.rels");
    if (!workbookXml || !relsXml) {
      throw new Error("The uploaded file was not a supported XLSX workbook.");
    }

    const relationships = parseRelationships(relsXml);
    const sharedStringsXml = zip.get("xl/sharedStrings.xml");
    const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
    const sheets = parseWorkbookSheets(workbookXml)
      .map((sheet) => {
        const target = relationships.get(sheet.relationshipId);
        if (!target) {
          return null;
        }

        const normalizedTarget = target.startsWith("xl/")
          ? target
          : `xl/${target.replace(/^\/+/u, "")}`;
        const worksheetXml = zip.get(normalizedTarget);
        if (!worksheetXml) {
          return null;
        }

        return {
          name: sheet.name,
          rows: parseWorksheetRows(worksheetXml, sharedStrings)
        };
      })
      .filter(Boolean);

    return { sheets };
  }
}

function readZipEntries(buffer) {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const directoryOffset = findCentralDirectoryOffset(data);
  const entries = new Map();
  let cursor = directoryOffset;

  while (cursor < data.length && data.readUInt32LE(cursor) === 0x02014b50) {
    const compressionMethod = data.readUInt16LE(cursor + 10);
    const compressedSize = data.readUInt32LE(cursor + 20);
    const fileNameLength = data.readUInt16LE(cursor + 28);
    const extraLength = data.readUInt16LE(cursor + 30);
    const commentLength = data.readUInt16LE(cursor + 32);
    const localHeaderOffset = data.readUInt32LE(cursor + 42);
    const fileName = data.toString("utf8", cursor + 46, cursor + 46 + fileNameLength);

    const localNameLength = data.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = data.readUInt16LE(localHeaderOffset + 28);
    const contentStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = data.subarray(contentStart, contentStart + compressedSize);

    let content;
    if (compressionMethod === 0) {
      content = compressed;
    } else if (compressionMethod === 8) {
      content = zlib.inflateRawSync(compressed);
    } else {
      throw new Error(`The workbook uses an unsupported ZIP compression method (${compressionMethod}).`);
    }

    entries.set(fileName, content.toString("utf8"));
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findCentralDirectoryOffset(buffer) {
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      return buffer.readUInt32LE(index + 16);
    }
  }

  throw new Error("The uploaded file did not contain a readable ZIP directory.");
}

function parseWorkbookSheets(xml) {
  const sheets = [];
  const pattern = /<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/?>/giu;
  let match = pattern.exec(xml);

  while (match) {
    sheets.push({
      name: decodeXml(match[1]),
      relationshipId: match[2]
    });
    match = pattern.exec(xml);
  }

  return sheets;
}

function parseRelationships(xml) {
  const relationships = new Map();
  const pattern = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/giu;
  let match = pattern.exec(xml);

  while (match) {
    relationships.set(match[1], decodeXml(match[2]));
    match = pattern.exec(xml);
  }

  return relationships;
}

function parseSharedStrings(xml) {
  const values = [];
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/giu;
  let itemMatch = itemPattern.exec(xml);

  while (itemMatch) {
    const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/giu;
    let textMatch = textPattern.exec(itemMatch[1]);
    let value = "";

    while (textMatch) {
      value += decodeXml(textMatch[1]);
      textMatch = textPattern.exec(itemMatch[1]);
    }

    values.push(value);
    itemMatch = itemPattern.exec(xml);
  }

  return values;
}

function parseWorksheetRows(xml, sharedStrings) {
  const rows = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/giu;
  let rowMatch = rowPattern.exec(xml);

  while (rowMatch) {
    const cells = [];
    const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/giu;
    let cellMatch = cellPattern.exec(rowMatch[1]);

    while (cellMatch) {
      const attributes = cellMatch[1] || cellMatch[3] || "";
      const body = cellMatch[2] || "";
      const reference = readAttribute(attributes, "r");
      const type = readAttribute(attributes, "t");
      const value = extractCellValue(body, type, sharedStrings);

      if (reference) {
        cells.push({
          reference,
          column: reference.replace(/[0-9]/gu, ""),
          value
        });
      }

      cellMatch = cellPattern.exec(rowMatch[1]);
    }

    if (cells.length > 0) {
      rows.push(cells);
    }

    rowMatch = rowPattern.exec(xml);
  }

  return rows;
}

function extractCellValue(xml, type, sharedStrings) {
  if (!xml) {
    return "";
  }

  if (type === "inlineStr") {
    return extractTextRuns(xml);
  }

  const valueMatch = xml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/iu);
  if (type === "s" && valueMatch) {
    const index = Number.parseInt(valueMatch[1], 10);
    return Number.isInteger(index) ? sharedStrings[index] ?? "" : "";
  }

  if (type === "str" && valueMatch) {
    return decodeXml(valueMatch[1]);
  }

  if (valueMatch) {
    return decodeXml(valueMatch[1]);
  }

  return extractTextRuns(xml);
}

function extractTextRuns(xml) {
  const pattern = /<t\b[^>]*>([\s\S]*?)<\/t>/giu;
  let match = pattern.exec(xml);
  let value = "";

  while (match) {
    value += decodeXml(match[1]);
    match = pattern.exec(xml);
  }

  return value;
}

function readAttribute(attributes, name) {
  const match = attributes.match(new RegExp(`${name}="([^"]*)"`, "iu"));
  return match ? decodeXml(match[1]) : null;
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, "\"")
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, "&");
}
