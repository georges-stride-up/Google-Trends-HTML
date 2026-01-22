// Netlify lambda equivalent (same behavior). Uses process.env.GITHUB_TOKEN
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) return { statusCode: 500, body: 'GITHUB_TOKEN missing' };

  const body = JSON.parse(event.body || '{}');
  const { repoOwner, repoName, filename, message, content, displayTitle } = body;
  if (!repoOwner || !repoName || !filename || !content) return { statusCode: 400, body: 'Missing parameters' };

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
    if (!putRes.ok) return { statusCode: putRes.status, body: JSON.stringify(putJson) };

    // update index.html (try/catch)
    try {
      const indexApi = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/index.html`;
      const idxRes = await fetch(indexApi, { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' }});
      if (idxRes.ok) {
        const idxJson = await idxRes.json();
        const idxSha = idxJson.sha;
        const raw = Buffer.from(idxJson.content, 'base64').toString('utf8');
        const link = `<li><a href='${filename}'>🔍 ${displayTitle || filename}</a></li>`;
        if (!raw.includes(link)) {
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
    } catch (e) {}

    return { statusCode: 200, body: JSON.stringify({ message: 'File created', html_url: putJson.content.html_url }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};
