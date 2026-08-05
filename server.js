const http = require('http');
const https = require('https');

const port = process.env.PORT || 3000;
const openaiKey = process.env.OPENAI_API_KEY;

if (!openaiKey) {
  console.error('Missing OPENAI_API_KEY environment variable.');
  process.exit(1);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1e6) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function openAiRequest(prompt) {
  const body = JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a helpful assistant that summarizes notes.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 150,
    temperature: 0.7
  });

  const options = {
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      Authorization: `Bearer ${openaiKey}`
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(JSON.stringify(parsed)));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/summarize') {
    res.writeHead(404, {
      ...corsHeaders,
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  try {
    const { prompt, noteText } = await parseJsonBody(req);
    if (!prompt && !noteText) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing prompt or noteText.' }));
      return;
    }

    const summaryPrompt = prompt || `Summarize this note in one short paragraph and explain its meaning clearly:\n\n${noteText}`;
    const data = await openAiRequest(summaryPrompt);
    const summary = data?.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      res.writeHead(502, {
        ...corsHeaders,
        'Content-Type': 'application/json'
      });
      res.end(JSON.stringify({ error: 'OpenAI returned no summary.' }));
      return;
    }

    res.writeHead(200, {
      ...corsHeaders,
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({ summary }));
  } catch (err) {
    console.error('AI proxy error', err);
    res.writeHead(500, {
      ...corsHeaders,
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({ error: 'AI proxy failed.', details: err.message || String(err) }));
  }
});

server.listen(port, () => {
  console.log(`AI proxy listening on http://localhost:${port}`);
});
