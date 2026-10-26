const Busboy = require("busboy");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { authenticatedTechnicalClient } = require("./po-integration");

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

async function parseMultipartAttachments(req) {
  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw Object.assign(new Error("Content-Type must be multipart/form-data"), { status: 415 });
  }
  const contentLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_TOTAL_BYTES + 1024 * 1024) {
    throw Object.assign(new Error("The combined attachment size exceeds the 200 MB limit"), { status: 413 });
  }
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "flowmate-ca-po-upload-"));
  try {
    const files = await new Promise((resolve, reject) => {
      let parser;
      try {
        parser = Busboy({ headers: req.headers, limits: { files: 20, fileSize: MAX_FILE_BYTES, fields: 0, parts: 20 } });
      } catch (error) {
        return reject(Object.assign(new Error(`Invalid multipart request: ${error.message}`), { status: 400 }));
      }
      const uploads = [];
      const writes = [];
      let totalBytes = 0;
      let parsingError;
      parser.on("file", (clientFileId, stream, info) => {
        const filePath = path.join(directory, crypto.randomUUID());
        const hash = crypto.createHash("sha256");
        let size = 0;
        const output = fs.createWriteStream(filePath, { flags: "wx" });
        stream.on("data", (chunk) => {
          size += chunk.length;
          totalBytes += chunk.length;
          hash.update(chunk);
          if (totalBytes > MAX_TOTAL_BYTES && !parsingError) {
            parsingError = Object.assign(new Error("The combined attachment size exceeds the 200 MB limit"), { status: 413 });
          }
        });
        stream.on("limit", () => {
          parsingError ||= Object.assign(new Error(`Attachment '${info.filename}' exceeds the 50 MB limit`), { status: 413 });
        });
        stream.pipe(output);
        writes.push(new Promise((done, fail) => {
          output.on("finish", () => {
            uploads.push({
              clientFileId,
              filename: info.filename,
              mimeType: String(info.mimeType || "").toLowerCase(),
              path: filePath,
              size,
              checksum: hash.digest("hex"),
              truncated: stream.truncated
            });
            done();
          });
          output.on("error", fail);
          stream.on("error", fail);
        }));
      });
      parser.on("field", () => {
        parsingError ||= Object.assign(new Error("Only binary multipart fields declared in attachmentManifest are allowed"), { status: 400 });
      });
      parser.on("filesLimit", () => {
        parsingError ||= Object.assign(new Error("The multipart request contains too many files"), { status: 413 });
      });
      parser.on("partsLimit", () => {
        parsingError ||= Object.assign(new Error("The multipart request contains too many parts"), { status: 413 });
      });
      parser.on("error", (error) => reject(Object.assign(error, { status: error.status || 400 })));
      parser.on("close", async () => {
        try {
          await Promise.all(writes);
          if (parsingError) return reject(parsingError);
          resolve(uploads);
        } catch (error) {
          reject(error);
        }
      });
      req.pipe(parser);
    });
    return { directory, files };
  } catch (error) {
    await fsp.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function cleanupMultipart(directory) {
  if (directory) await fsp.rm(directory, { recursive: true, force: true });
}

function attachmentUploadHandler() {
  return async (req, res) => {
    let upload;
    try {
      const user = cdsUser(req);
      // Reject before reading a potentially large body. The service repeats this
      // check inside the transaction and also verifies the creating client ID.
      authenticatedTechnicalClient(user);
      upload = await parseMultipartAttachments(req);
      const service = cdsService();
      const result = await service.uploadTechnicalPOAttachments({
        requestId: req.params.requestId,
        files: upload.files,
        user
      });
      res.status(result.alreadyCompleted ? 200 : 201).json(result);
    } catch (error) {
      const status = Number(error.status || error.statusCode || 500);
      const safeStatus = status >= 400 && status < 600 ? status : 500;
      const message = safeStatus >= 500 && !error.status && !error.statusCode
        ? "The attachment upload could not be completed"
        : error.message;
      res.status(safeStatus).json({ error: { code: String(safeStatus), message } });
    } finally {
      await cleanupMultipart(upload?.directory);
    }
  };
}

function cdsService() {
  const cds = require("@sap/cds");
  const service = cds.services.FlowmateCAService;
  if (!service) throw Object.assign(new Error("Flowmate CA service is unavailable"), { status: 503 });
  return service;
}

function cdsUser(req) {
  const cds = require("@sap/cds");
  return cds.context?.user || req.user;
}

module.exports = { parseMultipartAttachments, cleanupMultipart, attachmentUploadHandler, MAX_FILE_BYTES, MAX_TOTAL_BYTES };
