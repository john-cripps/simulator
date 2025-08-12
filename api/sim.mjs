// /api/sim.mjs
import { google } from 'googleapis';

export default async function handler(req, res) {
  try {
    // --- normalize domain ----------------------------------------------------
    const rawD = (req.query.d || '').toString();
    const normDomain = s =>
      (s ?? '')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/[\/\\].*$/, '')        // strip anything after / or \
        .replace(/[^a-z0-9.-]/g, '');    // sanitize

    const d = normDomain(rawD);
    if (!d) return res.status(400).json({ error: 'Missing ?d=domain' });

    // --- normalize private key from env (multi-line or \n) -------------------
    const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').trim();
    const maybeJson = raw.startsWith('{') ? JSON.parse(raw).private_key : raw;
    const private_key = maybeJson.includes('\\n')
      ? maybeJson.replace(/\\n/g, '\n').replace(/\r/g, '')
      : maybeJson.replace(/\r/g, '');

    if (!private_key.startsWith('-----BEGIN PRIVATE KEY-----')) {
      return res.status(500).json({ error: 'Key format error: not a PEM' });
    }

    // --- Google Sheets client -----------------------------------------------
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const sheetId = process.env.SHEET_ID;
    const sheetName = process.env.SHEET_NAME || 'Prospects';

    // Read all used cells on the tab (not just A:C)
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}`,
    });

    const rows = data.values || [];
    if (!rows.length) {
      return res.status(404).json({ error: `Sheet "${sheetName}" is empty` });
    }

    const headers = rows[0].map(h => (h ?? '').toString().trim().toLowerCase());
    const col = name => headers.indexOf(name);

    const iDomain  = col('domain');
    const iCompany = col('company');
    const iNiche   = col('niche');

    if (iDomain < 0) {
      return res.status(400).json({ error: `Couldn't find a "Domain" header in row 1` });
    }

    const matchRow = rows.slice(1).find(r => normDomain(r[iDomain]) === d);
    if (!matchRow) {
      return res.status(404).json({ error: `Domain "${d}" not found in "${sheetName}"` });
    }

    const company = (iCompany >= 0 ? (matchRow[iCompany] || '') : '') || d;
    const niche = ((iNiche >= 0 ? (matchRow[iNiche] || 'ecommerce') : 'ecommerce') + '')
      .toLowerCase();

    const BM_MAP = {
      ecommerce: { open: 28, click: 3.5, conv: 1.2, aov: 60, rpm: 0 },
      saas:      { open: 30, click: 4.0, conv: 2.0, aov:120, rpm: 0 },
      media:     { open: 34, click: 4.5, conv: 0.6, aov: 0,  rpm:18 },
      services:  { open: 32, click: 3.0, conv: 1.5, aov:250, rpm: 0 }
    };
    const BM = BM_MAP[niche] || BM_MAP.ecommerce;

    const response = {
      domain: d,
      company,
      niche,
      list: 10000,
      open: BM.open,
      click: BM.click,
      conv: BM.conv,
      aov: BM.aov,
      rpm: BM.rpm
    };

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(response);

  } catch (err) {
    // TEMP: return full error so we can see it in the browser
    console.error(err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
