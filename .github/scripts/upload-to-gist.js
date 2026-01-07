const https = require('https');
const fs = require('fs');

const GIST_ID = process.env.GIST_ID || null; // Set after first run
const GIST_TOKEN = process.env.GIST_TOKEN;

// Validates that the content is a safe SVG badge before uploading
function validateBadgeContent(content) {
  if (typeof content !== 'string') {
    throw new Error('Badge content must be a string');
  }

  // Ensure it's an SVG file
  if (!content.trim().startsWith('<svg')) {
    throw new Error('Content must be a valid SVG file');
  }

  // Ensure it contains download count data (expected format)
  if (!content.includes('Downloads') && !content.includes('downloads')) {
    throw new Error('Content must be a downloads badge SVG');
  }

  // Size check - badge should be small (< 10KB)
  if (content.length > 10000) {
    throw new Error('Badge content exceeds safe size limit');
  }

  return true;
}

function updateGist(gistId, content) {
  return new Promise((resolve, reject) => {
    // Validate content before sending to remote server
    try {
      validateBadgeContent(content);
    } catch (err) {
      return reject(new Error(`Badge validation failed: ${err.message}`));
    }

    const data = JSON.stringify({
      files: {
        'downloads-badge.svg': {
          content: content
        }
      }
    });

    const options = {
      hostname: 'api.github.com',
      path: gistId ? `/gists/${gistId}` : '/gists',
      method: gistId ? 'PATCH' : 'POST',
      headers: {
        'User-Agent': 'Badge-Generator',
        'Authorization': `token ${GIST_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        const response = JSON.parse(responseData);
        console.log('Gist URL:', response.html_url);
        console.log('Raw URL:', response.files['downloads-badge.svg'].raw_url);
        resolve(response);
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const badgeSvg = fs.readFileSync('downloads-badge.svg', 'utf8');

  if (!GIST_ID) {
    console.log('Creating new gist...');
    const result = await updateGist(null, badgeSvg);
    console.log('\nIMPORTANT: Add this to GitHub repository secrets:');
    console.log(`GIST_ID=${result.id}`);
  } else {
    console.log('Updating existing gist...');
    await updateGist(GIST_ID, badgeSvg);
  }
}

main().catch(console.error);
