import { readFileSync } from "node:fs";

const workbookTaxonomy = JSON.parse(
  readFileSync(new URL("./workbook-taxonomy.json", import.meta.url), "utf8")
);

export default workbookTaxonomy;
