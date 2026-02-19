const fs = require('fs');
const http = require('http');

// Read the full LOA template
const htmlContent = fs.readFileSync('./pdf-generator-lambda/loa-template.html', 'utf-8');

const payload = JSON.stringify({ html_content: htmlContent });

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/html-templates/LOA',
    method: 'PUT',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', data);
    });
});

req.on('error', (e) => {
    console.error('Error:', e.message);
});

req.write(payload);
req.end();
