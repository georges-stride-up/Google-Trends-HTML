// Vercel serverless function: POST /api/publish
// Expects JSON body: { repoOwner, repoName, filename, message, content (full HTML string), displayTitle }
// Requires env var: GITHUB_TOKEN

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const VALID_NAME = /^[a-zA-Z0-9\-]+$/;
const VALID_FILENAME = /^[a-z0-9\-_,]+\.html$/;

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  // CSRF check
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) return res.status(500).json({ message: 'Server configuration error' });

  let body;
  try { body = req.body; } catch {
    // Vercel dev body parser bug on Node 24 — try reading raw chunks
    try {
      const raw = req.rawBody || req.read();
      body = raw ? JSON.parse(typeof raw === 'string' ? raw : raw.toString()) : {};
    } catch { body = {}; }
  }
  const { repoOwner, repoName, filename, message, content, displayTitle } = body || {};

  // Input validation
  if (!repoOwner || !repoName || !filename || !content) {
    return res.status(400).json({ message: 'Missing parameters' });
  }
  if (!VALID_NAME.test(repoOwner) || !VALID_NAME.test(repoName)) {
    return res.status(400).json({ message: 'Invalid repository owner or name' });
  }
  if (!VALID_FILENAME.test(filename)) {
    return res.status(400).json({ message: 'Invalid filename' });
  }
  if (typeof content !== 'string' || !content.trimStart().startsWith('<!DOCTYPE')) {
    return res.status(400).json({ message: 'Invalid content' });
  }

  const safeTitle = displayTitle ? escapeHtml(displayTitle.replace(/<[^>]*>/g, '')) : filename;
  const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${encodeURIComponent(filename)}`;

  try {
    // Check existing file to get sha (if exists)
    let sha = null;
    const check = await fetch(apiUrl, { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' }});
    if (check.ok) {
      const existing = await check.json();
      sha = existing.sha;
    }

    // Create/Update file
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message || `Add/Update Trend: ${filename}`,
        content: Buffer.from(content, 'utf8').toString('base64'),
        sha: sha
      })
    });

    const putJson = await putRes.json();
    if (!putRes.ok) return res.status(putRes.status).json({ message: 'GitHub API error' });

    // Update index.html to add link
    try {
      const indexApi = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/index.html`;
      const idxRes = await fetch(indexApi, { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' }});
      if (idxRes.ok) {
        const idxJson = await idxRes.json();
        const idxSha = idxJson.sha;
        const raw = Buffer.from(idxJson.content, 'base64').toString('utf8');
        const today = new Date().toISOString().split('T')[0];
        const link = `<li data-name="${escapeHtml(safeTitle.toLowerCase())}"><a href="${escapeHtml(filename)}">${escapeHtml(safeTitle)}</a><small>${today}</small></li>`;
        if (!raw.includes(`href="${escapeHtml(filename)}"`)) {
          let newRaw;
          if (raw.includes('</ul>')) {
            newRaw = raw.replace('</ul>', `${link}\n</ul>`);
          } else {
            newRaw = raw + `\n${link}\n`;
          }
          await fetch(indexApi, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: `Add Trend to index: ${filename}`,
              content: Buffer.from(newRaw, 'utf8').toString('base64'),
              sha: idxSha
            })
          });
        }
      }
    } catch (e) {
      console.error('Index update failed:', e);
    }

    return res.status(200).json({ message: 'File created', html_url: putJson.content.html_url });
  } catch (err) {
    console.error('Publish error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
