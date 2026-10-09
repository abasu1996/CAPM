"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function harness(overrides = {}) {
  const warnings = [];
  let controller;
  class Control {
    constructor(settings) { this.settings = settings; this.closed = false; }
    bindValue() { return this; }
    bindProperty() { return this; }
    addContent() {}
    open() { this.closed = false; }
    close() { this.closed = true; }
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,
    "../app/flowmateca/webapp/controller/RequestCreate.controller.js"), "utf8"), {
    sap: { ui: { define(dependencies, factory) {
      controller = factory(...dependencies.map((name) => {
        if (name.endsWith("/BaseController")) return { extend: (_name, members) => members };
        if (name === "sap/m/MessageBox") return { warning: (message) => warnings.push(message) };
        return Control;
      }));
    } } }
  });
  const initialRows = [];
  const paymentData = { subProcessType_code: "PO_BEFORE_INVOICE_NON_ADV",
    details: { invoices: initialRows } };
  const editData = { invoiceNumber: "11111", invoiceDate: "2026-10-13",
    amount: "1111", vatAmount: "345678", sesReference: "45678", remarks: "Test",
    _editIndex: null, ...overrides };
  const updates = [];
  const paymentModel = {
    getProperty(key) {
      return key.split("/").filter(Boolean).reduce((data, part) => data[part], paymentData);
    },
    setProperty(key, value, context, asyncUpdate) {
      const parts = key.split("/").filter(Boolean);
      const last = parts.pop();
      parts.reduce((data, part) => data[part], paymentData)[last] = value;
      updates.push({ key, asyncUpdate });
      // Exercise the original failure: model data has changed, but synchronous
      // binding refresh interrupts Save before it can close the nested dialog.
      if (!asyncUpdate) throw new Error("Synchronous table binding refresh interrupted Save");
    }
  };
  const editModel = { getData: () => editData, setData: (data) => Object.assign(editData, data) };
  const dialog = new Control();
  controller.getView = () => ({
    getModel: (name) => name === "paymentRun" ? paymentModel : editModel,
    addDependent() {}
  });
  controller._paymentRunGridDialogs = { invoices: dialog };
  return { controller, dialog, warnings, paymentData, editData, initialRows, updates, Control };
}

test("non-advance PO invoice Save stores values and closes before binding refresh", () => {
  const h = harness();
  h.controller._savePaymentRunGridRow("invoices", h.dialog);
  assert.equal(h.dialog.closed, true);
  assert.equal(h.paymentData.details.invoices.length, 1);
  assert.equal(h.paymentData.details.invoices[0].amount, 1111);
  assert.equal(h.paymentData.details.invoices[0].vatAmount, 345678);
  assert.equal(h.paymentData.details.invoices[0].sesReference, "45678");
  assert.equal(h.paymentData.details.highestInvoiceValue, 1111);
  assert.equal(h.initialRows.length, 0);
  assert.ok(h.updates.every((update) => update.asyncUpdate === true));
  assert.equal(h.warnings.length, 0);
});

test("editing an invoice replaces the row and closes the supplied dialog", () => {
  const h = harness({ _editIndex: 0, amount: "2000" });
  h.initialRows.push({ invoiceNumber: "OLD", amount: 100 });
  h.controller._paymentRunGridDialogs.invoices = { close() { throw new Error("Wrong dialog"); } };
  h.controller._savePaymentRunGridRow("invoices", h.dialog);
  assert.equal(h.dialog.closed, true);
  assert.equal(h.paymentData.details.invoices.length, 1);
  assert.equal(h.paymentData.details.invoices[0].amount, 2000);
  assert.equal(h.initialRows[0].amount, 100);
});

test("missing mandatory VAT or SES reference keeps the dialog open without saving", () => {
  for (const field of ["invoiceNumber", "invoiceDate", "amount", "vatAmount", "sesReference"]) {
    const h = harness({ [field]: "" });
    h.controller._savePaymentRunGridRow("invoices", h.dialog);
    assert.equal(h.dialog.closed, false, field);
    assert.equal(h.paymentData.details.invoices.length, 0, field);
    assert.equal(h.warnings.length, 1, field);
  }
});

test("the rendered Save button closes its own dialog even if the cache changes", () => {
  const h = harness();
  h.controller._paymentRunGridDialogs = {};
  h.controller._openPaymentRunGridDialog("invoices", -1);
  const dialog = h.controller._paymentRunGridDialogs.invoices;
  Object.assign(h.editData, { invoiceNumber: "11111", invoiceDate: "2026-10-13",
    amount: "1111", vatAmount: "0", sesReference: "SES-1" });
  h.controller._paymentRunGridDialogs.invoices = { close() { throw new Error("Wrong dialog"); } };
  dialog.settings.beginButton.settings.press();
  assert.equal(dialog.closed, true);
  assert.equal(h.paymentData.details.invoices.length, 1);
});
