import XLSX from 'xlsx';
import sanitizeHtml from 'sanitize-html';

export const spreadsheetPreviewLimits = Object.freeze({ maxBytes: 25 * 1024 * 1024, maxSheets: 50, maxRows: 20000, maxCells: 500000 });

const bytes = async input => input instanceof ArrayBuffer ? new Uint8Array(input) : ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(await input.arrayBuffer());
const text = data => new TextDecoder().decode(data);
const has = (data, value) => text(data).includes(value);
const zipEntry = (data, name) => has(data, name);

export async function validateSpreadsheetInput(input, name, limits=spreadsheetPreviewLimits) {
  const data = await bytes(input);
  const extension = String(name || '').toLowerCase().split('.').pop();
  if (!['xls', 'xlsx'].includes(extension)) throw new Error('UNSUPPORTED_SPREADSHEET');
  if (!data.byteLength || data.byteLength > limits.maxBytes) throw new Error('SPREADSHEET_TOO_LARGE');
  if (extension === 'xls') {
    if (data.length < 8 || data[0] !== 0xd0 || data[1] !== 0xcf || data[2] !== 0x11 || data[3] !== 0xe0 || data[4] !== 0xa1 || data[5] !== 0xb1 || data[6] !== 0x1a || data[7] !== 0xe1) throw new Error('INVALID_XLS_SIGNATURE');
  } else {
    if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b || data[2] !== 0x03 || data[3] !== 0x04) throw new Error('INVALID_XLSX_SIGNATURE');
    if (!zipEntry(data, '[Content_Types].xml') || !zipEntry(data, 'xl/workbook.xml') || !zipEntry(data, 'xl/_rels/workbook.xml.rels') || !/xl\/worksheets\/sheet\d+\.xml/.test(text(data))) throw new Error('INVALID_XLSX_CONTAINER');
  }
  return { data, extension };
}

export async function renderSpreadsheetPreview(input, name, limits=spreadsheetPreviewLimits) {
  const checked = await validateSpreadsheetInput(input, name, limits);
  const workbook = XLSX.read(checked.data, { type: 'array', cellDates: true, dense: true, WTF: true, sheetRows: limits.maxRows });
  if (!Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0 || workbook.SheetNames.length > limits.maxSheets) throw new Error('INVALID_WORKBOOK');
  let cells = 0;
  const html = workbook.SheetNames.map(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || typeof sheet !== 'object') throw new Error('INVALID_WORKSHEET');
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true });
    if (rows.length > limits.maxRows) throw new Error('SPREADSHEET_TOO_LARGE');
    cells += rows.reduce((sum, row) => sum + (Array.isArray(row) ? row.length : 0), 0);
    if (cells > limits.maxCells) throw new Error('SPREADSHEET_TOO_LARGE');
    const body = rows.map(row => `<tr>${(Array.isArray(row) ? row : []).map(value => `<td>${String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`).join('')}</tr>`).join('');
    return `<h3>${String(sheetName).replace(/[&<>]/g, '')}</h3><table><tbody>${body}</tbody></table>`;
  }).join('');
  return sanitizeHtml(html, { allowedTags: ['h3', 'table', 'tbody', 'tr', 'td'], allowedAttributes: {} });
}
