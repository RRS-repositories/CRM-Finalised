# Terms & Conditions PDF Improvement - Implementation Plan

## Problem
The current T&C PDF generated on S3 looks poorly formatted compared to the nice webpage version. The PDF uses plain text parsing while the webpage uses rich HTML with proper styling.

## Solution
Use Puppeteer (already installed) to generate HTML-to-PDF conversion that matches the webpage structure.

## Implementation Steps

### 1. Create HTML Template Function
Create a function that generates the full HTML page with:
- Company logo and header
- Client details box
- Properly formatted HTML content from `tcHtml`
- CSS styling matching the webpage
- Proper spacing to avoid logo overlap

### 2. Modify server.js
Replace the current PDFKit-based PDF generation (lines 970-1057) with Puppeteer-based generation:

```javascript
// Use Puppeteer to generate PDF from HTML
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

// Set HTML content with proper styling
await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

// Generate PDF
const pdfBuffer = await page.pdf({
  format: 'A4',
  margin: {
    top: '20mm',
    right: '15mm',
    bottom: '20mm',
    left: '15mm'
  },
  printBackground: true
});

await browser.close();
```

### 3. HTML Template Structure
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    /* Match webpage CSS */
    body { font-family: Arial, sans-serif; }
    .header { margin-top: 30px; /* Space for logo */ }
    .logo { position: absolute; top: 20px; left: 20px; }
    .client-box { background: #f8fafc; padding: 20px; }
    h2 { color: #0f172a; border-bottom: 2px solid #f1f5f9; }
    table { border-collapse: collapse; width: 100%; }
    /* ... more styles ... */
  </style>
</head>
<body>
  <img src="data:image/png;base64,..." class="logo" />
  <div class="header">
    <h1>Rowan Rose Solicitors</h1>
    <p>Legal Professionals</p>
  </div>
  <div class="client-box">
    <!-- Client details -->
  </div>
  <div class="content">
    <!-- Populated HTML content -->
  </div>
</body>
</html>
```

## Benefits
✅ PDF will match webpage appearance exactly
✅ Proper HTML/CSS rendering
✅ Tables, headings, and formatting preserved
✅ Logo won't overlap content
✅ Professional appearance

## Files to Modify
- `/Users/sayedmohammadfirdousi/Desktop/Rowan Rose Solicitors/CRM-Finalised/server.js` (lines 970-1057)

## Next Steps
1. Import Puppeteer at top of server.js
2. Create HTML template generation function
3. Replace PDF generation code
4. Test with a form submission
5. Verify PDF on S3 matches webpage

Would you like me to implement this solution now?
