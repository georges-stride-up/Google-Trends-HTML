// Netlify lambda equivalent (same behavior). Uses process.env.GITHUB_TOKEN
const fetch = require('node-fetch');

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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
};

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };

  // CSRF check
  const headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  if (headers['x-requested-with'] !== 'XMLHttpRequest') {
    return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Forbidden' }) };
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Server configuration error' }) };

  const body = JSON.parse(event.body || '{}');
  const { repoOwner, repoName, filename, message, content, displayTitle } = body;

  // Input validation
  if (!repoOwner || !repoName || !filename || !content) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing parameters' }) };
  }
  if (!VALID_NAME.test(repoOwner) || !VALID_NAME.test(repoName)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Invalid repository owner or name' }) };
  }
  if (!VALID_FILENAME.test(filename)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Invalid filename' }) };
  }
  if (typeof content !== 'string' || !content.trimStart().startsWith('<!DOCTYPE')) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Invalid content' }) };
  }

  const safeTitle = displayTitle ? escapeHtml(displayTitle.replace(/<[^>]*>/g, '')) : filename;
  const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${encodeURIComponent(filename)}`;

  try {
    let sha = null;
    const check = await fetch(apiUrl, { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' }});
    if (check.ok) {
      const existing = await check.json();
      sha = existing.sha;
    }

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
    if (!putRes.ok) return { statusCode: putRes.status, headers: CORS_HEADERS, body: JSON.stringify({ message: 'GitHub API error' }) };

    // update index.html
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

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ message: 'File created', html_url: putJson.content.html_url }) };
  } catch (err) {
    console.error('Publish error:', err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Internal server error' }) };
  }
};
