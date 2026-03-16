const DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyU5lIGyxiXcE8fTb1RPJs9xKyBAJhUeI5GLtNPXm36m8HQiLo12TpB2Nab7qKnf7gW/exec';
const GOOGLE_SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL || DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!GOOGLE_SHEETS_WEBHOOK_URL) {
    res.status(501).json({
      error: 'Feedback logging webhook is not configured',
      requiredEnv: 'GOOGLE_SHEETS_WEBHOOK_URL',
    });
    return;
  }

  try {
    const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body || {}),
    });

    const text = await response.text();

    if (!response.ok) {
      res.status(502).json({
        error: 'Failed to write feedback to Google Sheets',
        details: text,
      });
      return;
    }

    res.status(200).json({ ok: true, upstream: text });
  } catch (error) {
    console.error('Vercel feedback logging failed:', error);
    res.status(502).json({ error: 'Feedback logging failed' });
  }
}
