import { NodeResponse } from "../http/response.js";
import { renderAppHeader, renderAppShellStyles } from "./app-shell.js";

export class UtmImportController {
  constructor({ trackerImportService }) {
    this.trackerImportService = trackerImportService;
  }

  async handleHtml() {
    return NodeResponse.text(renderHtml({
      inventory: this.trackerImportService.getImportInventory()
    }), 200, {
      "Content-Type": "text/html; charset=utf-8"
    });
  }

  async handleImport(request) {
    const parsedBody = request.parseJson();
    if (!parsedBody.ok) {
      return NodeResponse.json({
        status: "error",
        error: {
          code: parsedBody.errorCode,
          message: parsedBody.errorMessage
        }
      }, 400);
    }

    const files = Array.isArray(parsedBody.value.files)
      ? parsedBody.value.files
      : [];
    if (files.length === 0) {
      return NodeResponse.json({
        status: "error",
        error: {
          code: "missing_files",
          message: "Select one or more Excel files to import."
        }
      }, 422);
    }

    const result = this.trackerImportService.importFiles(files);
    return NodeResponse.json({
      status: "ok",
      result
    });
  }

  async handleReset() {
    const result = this.trackerImportService.resetImports();
    return NodeResponse.json({
      status: "ok",
      result: {
        ...result,
        inventory: this.trackerImportService.getImportInventory()
      }
    });
  }
}

function renderHtml(view) {
  const inventory = view.inventory ?? {
    importedRequests: 0,
    importedGeneratedLinks: 0
  };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Import History</title>
  <style>
    :root{--bg:#f4efe5;--panel:rgba(255,250,242,.95);--ink:#17302a;--muted:#66766f;--accent:#0d6c5e;--line:rgba(23,48,42,.1);--shadow:0 24px 60px rgba(20,32,31,.09);--danger:#b4432b;--danger-bg:rgba(180,67,43,.12)}
    *{box-sizing:border-box}body{margin:0;color:var(--ink);font-family:"Aptos","Segoe UI",sans-serif;background:radial-gradient(circle at top left,rgba(13,108,94,.18),transparent 32rem),radial-gradient(circle at top right,rgba(183,142,65,.12),transparent 26rem),linear-gradient(180deg,#faf7f1 0%,var(--bg) 100%)}
    .shell{max-width:1080px;margin:0 auto;padding:1.4rem 1rem 3rem}.panel{background:var(--panel);border:1px solid var(--line);border-radius:1.35rem;box-shadow:var(--shadow);padding:1rem 1.05rem;margin-bottom:1rem}
    ${renderAppShellStyles()}
    .top,.actions,.stats,.file-list{display:flex;gap:.8rem;flex-wrap:wrap}.top{justify-content:space-between;align-items:flex-end}
    h1,h2,p{margin:0}h1,h2{font-family:"Aptos Display","Trebuchet MS",sans-serif}h1{font-size:clamp(2rem,5vw,3rem);line-height:.98;letter-spacing:-.05em}h2{font-size:1.18rem}
    .lede,.meta{color:var(--muted);line-height:1.55}
    input[type=file]{width:100%;padding:1rem;border:1px dashed rgba(23,48,42,.2);border-radius:1rem;background:rgba(255,255,255,.76);font:inherit}
    .button,.link-button,.danger-button{display:inline-flex;align-items:center;justify-content:center;min-height:2.75rem;padding:.76rem 1rem;border-radius:999px;border:1px solid var(--line);font:inherit;text-decoration:none;cursor:pointer;background:rgba(255,255,255,.74);color:var(--ink)}
    .button{background:var(--accent);border-color:transparent;color:#fff}.danger-button{background:#fff3f0;border-color:rgba(180,67,43,.22);color:var(--danger)}
    .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.8rem}.stat{padding:.95rem 1rem;border:1px solid var(--line);border-radius:1rem;background:rgba(255,255,255,.8)}.stat strong{display:block;font-size:1.5rem;letter-spacing:-.05em}.stat span{color:var(--muted)}
    .status{min-height:1.2rem;font-size:.9rem;color:var(--muted)}.status.error{color:var(--danger)}.status.success{color:var(--accent)}
    .card{padding:.9rem 1rem;border:1px solid var(--line);border-radius:1rem;background:rgba(255,255,255,.78)}
    .danger-card{background:linear-gradient(180deg,rgba(255,247,244,.96),rgba(255,250,242,.92));border-color:rgba(180,67,43,.14)}
    .file-list,.sheet-list{display:grid;gap:.7rem}.sheet-list{margin-top:.65rem}.sheet-row{display:flex;gap:.6rem;flex-wrap:wrap;color:var(--muted)}
    .hidden{display:none}
    @media (max-width:900px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media (max-width:640px){.shell{padding-inline:.85rem}.panel{border-radius:1rem}.stats{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main class="shell">
    ${renderAppHeader("imports")}
    <section class="panel">
      <div class="top">
        <div>
          <h1>Import History</h1>
          <p class="lede">Upload one or more historical Excel tracker files. The importer reads the client tabs, skips helper sheets like VALUES and CAMPAIGNS, and adds those links to the app.</p>
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>Choose Excel Files</h2>
      <p class="meta" style="margin-top:.35rem;margin-bottom:.85rem">Accepted format: .xlsx. If the same historical row was already imported, it is skipped automatically.</p>
      <form id="import-form">
        <input type="file" id="file-input" accept=".xlsx" multiple>
        <div class="actions" style="margin-top:1rem">
          <button class="button" type="submit" data-submit>Import Files</button>
          <div class="status" id="form-status" aria-live="polite"></div>
        </div>
      </form>
    </section>

    <section class="panel danger-card">
      <h2>Delete Imported History</h2>
      <p class="meta" style="margin-top:.35rem;margin-bottom:.85rem">Use this only when you want to remove links that came from imported Excel files and then import a cleaned workbook again. This deletes imported history rows and imported saved-link records that are no longer used anywhere else.</p>
      <div class="stats" style="margin-top:.85rem">
        <div class="stat"><strong id="inventory-imported-requests">${inventory.importedRequests}</strong><span>Imported history rows</span></div>
        <div class="stat"><strong id="inventory-imported-links">${inventory.importedGeneratedLinks}</strong><span>Imported saved-link records</span></div>
      </div>
      <div class="actions" style="margin-top:1rem">
        <button class="danger-button" type="button" id="reset-imports-button">Delete Imported Links</button>
        <div class="status" id="reset-status" aria-live="polite"></div>
      </div>
    </section>

    <section class="panel hidden" id="result-panel">
      <h2>Import Results</h2>
      <div class="stats" style="margin-top:.85rem">
        <div class="stat"><strong id="summary-attempted">0</strong><span>Rows checked</span></div>
        <div class="stat"><strong id="summary-imported">0</strong><span>Imported</span></div>
        <div class="stat"><strong id="summary-skipped">0</strong><span>Skipped</span></div>
        <div class="stat"><strong id="summary-errors">0</strong><span>Errors</span></div>
      </div>
      <div class="file-list" id="file-results" style="margin-top:1rem"></div>
    </section>
  </main>
  <script>
    (function () {
      const form = document.getElementById("import-form");
      const input = document.getElementById("file-input");
      const status = document.getElementById("form-status");
      const resetStatus = document.getElementById("reset-status");
      const resultPanel = document.getElementById("result-panel");
      const submitButton = form.querySelector("[data-submit]");
      const resetButton = document.getElementById("reset-imports-button");

      function showStatus(message, level) {
        status.textContent = message || "";
        status.className = "status" + (level ? " " + level : "");
      }

      function showResetStatus(message, level) {
        resetStatus.textContent = message || "";
        resetStatus.className = "status" + (level ? " " + level : "");
      }

      function readFile(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const bytes = new Uint8Array(reader.result);
            let binary = "";
            for (let index = 0; index < bytes.length; index += 1) {
              binary += String.fromCharCode(bytes[index]);
            }
            resolve({
              name: file.name,
              content_base64: btoa(binary)
            });
          };
          reader.onerror = () => reject(new Error("Unable to read " + file.name));
          reader.readAsArrayBuffer(file);
        });
      }

      function renderResults(payload) {
        resultPanel.classList.remove("hidden");
        document.getElementById("summary-attempted").textContent = String(payload.summary.attempted);
        document.getElementById("summary-imported").textContent = String(payload.summary.imported);
        document.getElementById("summary-skipped").textContent = String(payload.summary.skipped);
        document.getElementById("summary-errors").textContent = String(payload.summary.errors);
        document.getElementById("file-results").innerHTML = payload.files.map((file) => {
          return '<div class="card">'
            + '<strong>' + escapeHtml(file.fileName) + '</strong>'
            + '<div class="meta" style="margin-top:.35rem">' + escapeHtml(file.message || "") + '</div>'
            + '<div class="sheet-list">'
            + (file.sheets || []).map((sheet) => {
              return '<div class="sheet-row"><span><strong>' + escapeHtml(sheet.name) + '</strong></span><span>' + sheet.imported + ' imported</span><span>' + sheet.skipped + ' skipped</span><span>' + sheet.errors + ' errors</span></div>';
            }).join("")
            + '</div>'
            + '</div>';
        }).join("");
      }

      function applyInventory(payload) {
        document.getElementById("inventory-imported-requests").textContent = String(payload.importedRequests ?? 0);
        document.getElementById("inventory-imported-links").textContent = String(payload.importedGeneratedLinks ?? 0);
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const files = [...(input.files || [])];
        if (files.length === 0) {
          showStatus("Select one or more XLSX files first.", "error");
          return;
        }

        submitButton.disabled = true;
        showStatus("Reading workbook files...", "");

        try {
          const payloadFiles = [];
          for (const file of files) {
            payloadFiles.push(await readFile(file));
          }

          showStatus("Importing workbook rows...", "");
          const response = await fetch("/imports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files: payloadFiles })
          });
          const body = await response.json();
          if (!response.ok || body.status !== "ok") {
            const message = body && body.error && body.error.message ? body.error.message : "Unable to import those Excel files.";
            showStatus(message, "error");
            return;
          }

          renderResults(body.result);
          showStatus("Import finished.", "success");
        } catch (error) {
          showStatus(error && error.message ? error.message : "Unable to import those Excel files.", "error");
        } finally {
          submitButton.disabled = false;
        }
      });

      resetButton.addEventListener("click", async () => {
        if (!window.confirm("Delete all links that were added from imported Excel files?")) {
          return;
        }

        resetButton.disabled = true;
        showResetStatus("Deleting imported history...", "");

        try {
          const response = await fetch("/imports/reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
          });
          const body = await response.json();
          if (!response.ok || body.status !== "ok") {
            const message = body && body.error && body.error.message ? body.error.message : "Unable to delete the imported history.";
            showResetStatus(message, "error");
            return;
          }

          applyInventory(body.result.inventory || {});
          showResetStatus(
            "Deleted " + body.result.deletedRequests + " imported history row(s) and " + body.result.deletedGeneratedLinks + " imported saved-link record(s).",
            "success"
          );
        } catch (error) {
          showResetStatus(error && error.message ? error.message : "Unable to delete the imported history.", "error");
        } finally {
          resetButton.disabled = false;
        }
      });

      function escapeHtml(value) {
        return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }
    })();
  </script>
</body>
</html>`;
}
