sap.ui.define([], function () {
  "use strict";

  // Reading tables back from a file the user edited (Excel .xlsx or .csv), and filling a
  // per-line value from it. No library: an .xlsx is a zip of XML parts, unzipped with the
  // browser's DecompressionStream.

  const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
  const decodeXml = function (text) {
    return String(text).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (match, entity) {
      if (entity[0] === "#") {
        return String.fromCodePoint(entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
      }
      return ENTITIES[entity.toLowerCase()];
    });
  };

  // The text of every <t> in a shared string or inline string, skipping phonetic runs (<rPh>).
  const textOf = function (xml) {
    const plain = String(xml || "").replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
    let text = "";
    plain.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, function (_match, inner) {
      text += decodeXml(inner);
    });
    return text;
  };

  const inflateRaw = async function (bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };

  // { "xl/workbook.xml": () => Promise<string>, ... } from the zip's central directory.
  const unzip = function (buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
      if (view.getUint32(offset, true) === 0x06054b50) {
        end = offset;
        break;
      }
    }
    if (end < 0) {
      throw new Error("The file is not a valid Excel (.xlsx) file.");
    }
    const count = view.getUint16(end + 10, true);
    let entry = view.getUint32(end + 16, true);
    const decoder = new TextDecoder();
    const files = {};
    for (let index = 0; index < count && view.getUint32(entry, true) === 0x02014b50; index++) {
      const method = view.getUint16(entry + 10, true);
      const size = view.getUint32(entry + 20, true);
      const nameLength = view.getUint16(entry + 28, true);
      const skip = nameLength + view.getUint16(entry + 30, true) + view.getUint16(entry + 32, true);
      const local = view.getUint32(entry + 42, true);
      const name = decoder.decode(bytes.subarray(entry + 46, entry + 46 + nameLength));
      files[name] = async function () {
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        const data = bytes.subarray(start, start + size);
        return decoder.decode(method === 8 ? await inflateRaw(data) : data);
      };
      entry += 46 + skip;
    }
    return files;
  };

  // "AB12" -> 27 (zero-based column index).
  const columnIndex = function (reference) {
    const letters = /^[A-Z]+/i.exec(reference || "");
    if (!letters) {
      return -1;
    }
    return letters[0].toUpperCase().split("").reduce(function (sum, letter) {
      return sum * 26 + letter.charCodeAt(0) - 64;
    }, 0) - 1;
  };

  // The path of the workbook's first sheet, from the workbook and its relationships.
  const firstSheetPath = async function (files) {
    try {
      const workbook = await files["xl/workbook.xml"]();
      const sheet = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook) || /<sheet\b[^>]*\bid="([^"]+)"/.exec(workbook);
      const rels = await files["xl/_rels/workbook.xml.rels"]();
      const rel = new RegExp(`<Relationship\\b[^>]*\\bId="${sheet[1]}"[^>]*>`).exec(rels);
      const target = /\bTarget="([^"]+)"/.exec(rel[0])[1];
      const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
      if (files[path]) {
        return path;
      }
    } catch (error) {
      // Fall back to the first worksheet part below.
    }
    return Object.keys(files).filter(function (name) {
      return /^xl\/worksheets\/[^/]+\.xml$/.test(name);
    }).sort()[0];
  };

  const readXlsx = async function (buffer) {
    const files = unzip(buffer);
    const sheetPath = await firstSheetPath(files);
    if (!sheetPath) {
      throw new Error("The Excel file has no worksheet.");
    }
    const shared = [];
    if (files["xl/sharedStrings.xml"]) {
      (await files["xl/sharedStrings.xml"]()).replace(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\s*\/>/g, function (_match, inner) {
        shared.push(textOf(inner));
      });
    }
    const rows = [];
    (await files[sheetPath]()).replace(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g, function (_match, inner) {
      const row = [];
      let next = 0;
      String(inner || "").replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, function (_cell, attributes, body) {
        const reference = /\br="([^"]+)"/.exec(attributes);
        const column = reference ? columnIndex(reference[1]) : next;
        const type = (/\bt="([^"]+)"/.exec(attributes) || [])[1];
        const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body || "");
        let value = "";
        if (type === "s") {
          value = raw ? shared[Number(raw[1])] || "" : "";
        } else if (type === "inlineStr") {
          value = textOf(body);
        } else if (type === "b") {
          value = raw && raw[1] === "1" ? "TRUE" : "FALSE";
        } else if (raw) {
          value = decodeXml(raw[1]);
        }
        while (row.length < column) {
          row.push("");
        }
        row[column] = value;
        next = column + 1;
      });
      rows.push(row);
    });
    return rows.filter(function (row) {
      return row.some(function (cell) { return String(cell).trim() !== ""; });
    });
  };

  const parseCsv = function (text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (inQuotes) {
        if (char === "\"") {
          if (text[i + 1] === "\"") {
            field += "\"";
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
      } else if (char === "\"") {
        inQuotes = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") {
          i++;
        }
        row.push(field);
        field = "";
        if (row.length > 1 || row[0] !== "") {
          rows.push(row);
        }
        row = [];
      } else {
        field += char;
      }
    }
    if (field !== "" || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  };

  const normalize = function (text) {
    return String(text === undefined || text === null ? "" : text).trim().toLowerCase();
  };

  // "2026-10-18", "18/10/2026" or an Excel date number (days since 1899-12-30) -> "2026-10-18";
  // anything else -> "".
  const asIsoDate = function (value) {
    const text = String(value === undefined || value === null ? "" : value).trim();
    if (/^\d{4,5}(\.\d+)?$/.test(text) && Number(text) > 0 && Number(text) < 2958466) {
      return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(text)) * 86400000).toISOString().slice(0, 10);
    }
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text) || /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
    if (!match) {
      return "";
    }
    const iso = match[1].length === 4;
    const year = Number(iso ? match[1] : match[3]);
    const month = Number(match[2]);
    const day = Number(iso ? match[3] : match[1]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      return "";
    }
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  const asBoolean = function (value) {
    return value === true || ["true", "yes", "x", "1"].indexOf(normalize(value)) >= 0;
  };

  return {
    parseCsv: parseCsv,
    readXlsx: readXlsx,
    asIsoDate: asIsoDate,
    asBoolean: asBoolean,

    // The rows of an editable table from a file: the header row names the columns by label
    // (case-insensitive; unknown headers are ignored). Each data row starts from the existing
    // row with the same "#" (keeping values the file doesn't carry) or a blank one, so the file
    // decides which rows exist. Rows come back numbered 1..n. matched is the number of columns found.
    toRows: function (fileRows, columns, existingRows) {
      const header = (fileRows[0] || []).map(normalize);
      const numberAt = header.indexOf("#");
      const byIndex = header.map(function (text) {
        return columns.find(function (col) { return normalize(col.label) === text; }) || null;
      });
      const matched = byIndex.filter(Boolean).length;
      const rows = fileRows.slice(1)
        .filter(function (row) { return row.some(function (cell) { return String(cell).trim() !== ""; }); })
        .map(function (row) {
          const number = numberAt >= 0 ? Number(String(row[numberAt] || "").trim()) : NaN;
          const existing = (existingRows || []).find(function (entry) { return Number(entry.itemNo) === number; });
          const item = existing ? Object.assign({}, existing) : {};
          columns.forEach(function (col) {
            if (!existing) {
              item[col.name] = col.type === "checkbox" ? false : "";
            }
          });
          byIndex.forEach(function (col, index) {
            if (!col) {
              return;
            }
            const raw = row[index] !== undefined ? row[index] : "";
            item[col.name] = col.type === "checkbox" ? asBoolean(raw)
              : (col.type === "date" ? asIsoDate(raw) : String(raw));
          });
          return item;
        })
        .map(function (item, index) { return Object.assign(item, { itemNo: index + 1 }); });
      return { rows: rows, matched: matched };
    },

    // Rows of cell texts from an .xlsx or .csv File (by extension).
    readTableFile: async function (file) {
      if (/\.csv$/i.test(file.name || "")) {
        return parseCsv((await file.text()).replace(/^﻿/, ""));
      }
      return readXlsx(await file.arrayBuffer());
    },

    // Fills lineRows[].value from the file's rows: the header row names the "#" column and the
    // value column (valueLabel); each data row updates the line with the same #. Other columns are
    // ignored, and a blank cell keeps the line's current value. Returns new line rows, the number
    // updated and the # values that matched no line, or missingColumn when a header is absent.
    applyImport: function (rows, lineRows, options) {
      const header = (rows[0] || []).map(normalize);
      const numberAt = header.indexOf("#");
      const valueAt = header.indexOf(normalize(options.valueLabel));
      if (numberAt < 0 || valueAt < 0) {
        return { missingColumn: numberAt < 0 ? "#" : options.valueLabel, rows: lineRows, updated: 0, unmatched: [] };
      }
      const result = (lineRows || []).map(function (line) { return Object.assign({}, line); });
      const unmatched = [];
      let updated = 0;
      rows.slice(1).forEach(function (row) {
        const number = String(row[numberAt] === undefined ? "" : row[numberAt]).trim();
        const value = String(row[valueAt] === undefined ? "" : row[valueAt]).trim();
        if (!number || !value) {
          return;
        }
        const line = result.find(function (entry) { return Number(entry.itemNo) === Number(number); });
        if (!line) {
          unmatched.push(number);
          return;
        }
        line.value = options.maxLength ? value.slice(0, options.maxLength) : value;
        updated++;
      });
      return { rows: result, updated: updated, unmatched: unmatched };
    }
  };
});
