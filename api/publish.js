// Vercel serverless function: POST /api/publish
// Expects JSON body: { repoOwner, repoName, filename, message, content (full HTML string), displayTitle }
// Requires env var: GITHUB_TOKEN (a repo-scoped PAT or, better, an installation token)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) return res.status(500).json({ message: 'GITHUB_TOKEN is not configured on the server.' });

  const { repoOwner, repoName, filename, message, content, displayTitle } = req.body || {};
  if (!repoOwner || !repoName || !filename || !content) {
    return res.status(400).json({ message: 'Missing parameters' });
  }

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
    if (!putRes.ok) return res.status(putRes.status).json(putJson);

    // Optionally update index.html to add link
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
    } catch (e) {
      // non-fatal; ignore
    }

    return res.status(200).json({ message: 'File created', html_url: putJson.content.html_url });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}
