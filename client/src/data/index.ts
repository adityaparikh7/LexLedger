// What the pages use for data. With the cloud server everything reads and writes the device's
// copy (works offline; synced in the background); with the desktop server it is the REST API.
// Server-side actions (PDF, Excel, email) first make sure the server has the latest changes.
import { useSyncExternalStore } from 'react';
import * as api from '../api';
import type { Client, FirmProfile, Id, Invoice, Payment } from '../api';
import * as local from './local';
import { bumpDataVersion, ensureServerUpToDate, getDataVersion, getSyncState, requestSync, subscribeDataVersion, subscribeSyncState } from '../local/sync';

let mode: 'desktop' | 'cloud' = 'desktop';
export function setDataMode(next: 'desktop' | 'cloud') {
  mode = next;
}
const cloud = () => mode === 'cloud';

async function desktopWrite<T>(write: Promise<T>): Promise<T> {
  const result = await write;
  bumpDataVersion();
  return result;
}

/** Changes whenever the data changes (a local edit or a sync); add it to a page's load deps. */
export const useDataVersion = () => useSyncExternalStore(subscribeDataVersion, getDataVersion);
export const useSyncState = () => useSyncExternalStore(subscribeSyncState, getSyncState);

// ---- Reads ----

export const getDashboard = (timeFilter = 'all', startDate?: string, endDate?: string) =>
  cloud() ? local.getDashboard(timeFilter, startDate, endDate) : api.getDashboard(timeFilter, startDate, endDate);
export const getClients = () => (cloud() ? local.getClients() : api.getClients());
export const getClient = (id: Id) => (cloud() ? local.getClient(id) : api.getClient(id));
export const getInvoices = (params?: { status?: string; client_id?: string }) =>
  cloud() ? local.getInvoices(params) : api.getInvoices(params);
export const getInvoice = (id: Id) => (cloud() ? local.getInvoice(id) : api.getInvoice(id));
export const getFirmProfile = () => (cloud() ? local.getFirmProfile() : api.getFirmProfile());

// ---- Writes ----

export const createClient = (data: Partial<Client>) =>
  cloud() ? local.createClient(data) : desktopWrite(api.createClient(data));
export const updateClient = (id: Id, data: Partial<Client>) =>
  cloud() ? local.updateClient(id, data) : desktopWrite(api.updateClient(id, data));
export const deleteClient = (id: Id) => (cloud() ? local.deleteClient(id) : desktopWrite(api.deleteClient(id)));
export const createInvoice = (data: Partial<Invoice>) =>
  cloud() ? local.createInvoice(data) : desktopWrite(api.createInvoice(data));
export const updateInvoice = (id: Id, data: Partial<Invoice>) =>
  cloud() ? local.updateInvoice(id, data) : desktopWrite(api.updateInvoice(id, data));
export const deleteInvoice = (id: Id) => (cloud() ? local.deleteInvoice(id) : desktopWrite(api.deleteInvoice(id)));
export const updateInvoiceStatus = (id: Id, status: string, payments?: Payment[]) =>
  cloud() ? local.updateInvoiceStatus(id, status, payments) : desktopWrite(api.updateInvoiceStatus(id, status, payments));
export const updateInvoicePayments = (id: Id, payments: Payment[]) =>
  cloud() ? local.updateInvoicePayments(id, payments) : desktopWrite(api.updateInvoicePayments(id, payments));
export const updateFirmProfile = (data: Partial<FirmProfile>) =>
  cloud() ? local.updateFirmProfile(data) : desktopWrite(api.updateFirmProfile(data));

// ---- Actions that run on the server ----

/** In cloud mode: sync first, and use the device's current copy of the invoice (an invoice
 *  created offline only gets its number from that sync). */
async function serverReady(id?: Id): Promise<Invoice | undefined> {
  if (!cloud()) return undefined;
  await ensureServerUpToDate();
  return id === undefined ? undefined : local.getInvoice(id);
}

export async function downloadPDF(id: Id, invoiceNumber: string | null, clientName: string, date: string) {
  const fresh = await serverReady(id);
  return api.downloadPDF(id, fresh?.invoice_number ?? invoiceNumber, fresh?.client_name ?? clientName, fresh?.date ?? date);
}
export async function fetchPDFFile(id: Id, invoiceNumber: string | null, clientName: string, date: string) {
  const fresh = await serverReady(id);
  return api.fetchPDFFile(id, fresh?.invoice_number ?? invoiceNumber, fresh?.client_name ?? clientName, fresh?.date ?? date);
}
export async function downloadAccountExport() {
  await serverReady();
  return api.downloadAccountExport();
}
export async function fetchPDFPreviewUrl(id: Id) {
  await serverReady();
  return api.fetchPDFPreviewUrl(id);
}
export async function downloadExcel(id: Id, invoiceNumber: string | null) {
  const fresh = await serverReady(id);
  return api.downloadExcel(id, fresh?.invoice_number ?? invoiceNumber);
}
export async function downloadExportExcel(startDate: string, endDate: string) {
  await serverReady();
  return api.downloadExportExcel(startDate, endDate);
}
export async function downloadBulkPDFs(clientId: Id, status: string, clientName: string) {
  await serverReady();
  return api.downloadBulkPDFs(clientId, status, clientName);
}
export async function sendInvoice(id: Id) {
  await serverReady();
  const result = await api.sendInvoice(id);
  if (cloud()) requestSync(0); // the server marked it sent
  return result;
}
export async function sendReminder(id: Id) {
  await serverReady();
  return api.sendReminder(id);
}
