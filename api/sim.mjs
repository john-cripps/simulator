import { google } from 'googleapis';

export default async function handler(req, res) {
  try {
    const d = (req.query.d || '').toString().trim().toLowerCase();
    if (!d) return res.status(400).json({ error: 'Missing ?d=domain' });

    // ✅ Normalize private key from env:
    // - works if you pasted the whole JSON by mistake
    // - works if key is multiline
    // - works if key uses \n
    const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').trim();
    const maybeJson = raw.startsWith('{') ? JSON.parse(raw).private_key : raw;
    const private_key = maybeJson.includes('\\n')
      ? maybeJson.replace(/\\n/g, '\n').replace(/\r/g, '')
      : maybeJson.replace(/\r/g, '');

    if (!private_key.startsWith('-----BEGIN PRIVATE KEY-----')) {
      console.error('Private key not in PEM format');
      return res.status(500).json({ error: 'Key format error' });
    }

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

    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:C`,
    });

    const rows = data.values || [];
    if (rows.length === 0) return res.status(404).json({ error: 'Empty sheet' });
    const headers = rows[0];
    const iDomain = headers.indexOf('Domain');
    const iCompany = headers.indexOf('Company');
    const iNiche = headers.indexOf('Niche');
    if (iDomain < 0) return res.status(400).json({ error: '"Domain" column not found' });

    const match = rows.slice(1).find(r => (r[iDomain] || '').toString().toLowerCase() === d);
    if (!match) return res.status(404).json({ error: 'Domain not found' });

    const company = (iCompany >= 0 ? (match[iCompany] || '') : '') || d;
    const niche = ((iNiche >= 0 ? (match[iNiche] || 'ecommerce') : 'ecommerce')).toLowerCase();

    const BM_MAP = {
      ecommerce: { open: 28, click: 3.5, conv: 1.2, aov: 60, rpm: 0 },
      saas:      { open: 30, click: 4.0, conv: 2.0, aov:120, rpm: 0 },
      media:     { open: 34, click: 4.5, conv: 0.6, aov: 0,  rpm:18 },
      services:  { open: 32, click: 3.0, conv: 1.5, aov:250, rpm: 0 }
    };
    const BM = BM_MAP[niche] || BM_MAP['ecommerce'];

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
    
export default async function handler(req, res) {
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').trim();
  const startsWith = raw.slice(0, 31);
  const endsWith = raw.slice(-31);
  res.status(200).json({
    haveEmail: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    haveKey: !!raw,
    keyLooksJson: raw.startsWith('{'),
    keyStartsWith: startsWith,   // should show -----BEGIN PRIVATE KEY-----
    keyEndsWith: endsWith,       // should show PRIVATE KEY-----\n or similar
    sheetId: process.env.SHEET_ID || null,
    sheetName: process.env.SHEET_NAME || null
  });
}

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
