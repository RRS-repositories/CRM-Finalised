# Signature Timestamp Feature

## Overview
When a client submits the intake form (`/intake`), their signature is now automatically timestamped before being uploaded to AWS S3. The timestamp appears at the bottom of the signature image in PNG format.

## Changes Made

### 1. Dependencies Added
- **canvas** (node-canvas): Installed to enable server-side image manipulation
  ```bash
  npm install canvas
  ```

### 2. Server.js Modifications

#### Import Statement (Line 17)
Added canvas library import:
```javascript
import { createCanvas, loadImage } from 'canvas';
```

#### New Helper Function (Lines 679-729)
Created `addTimestampToSignature()` function that:
- Takes the base64 signature data from the frontend
- Loads the original signature image
- Creates a new canvas with 40px extra height at the bottom
- Draws the original signature at the top
- Adds timestamp text at the bottom center
- Returns the modified image as a PNG buffer

**Timestamp Format**: `DD/MM/YYYY, HH:MM:SS` (24-hour format, GB locale)
**Text Style**: 
- Color: `#64748b` (slate-500)
- Font: `12px Arial`
- Position: Centered, 25px below the original signature
- Text: `Signed on: [timestamp]`

#### Updated Signature Upload (Lines 955-966)
Modified the `/api/submit-page1` endpoint to:
- Call `addTimestampToSignature()` before uploading to S3
- Upload the timestamped signature instead of the original

**Before:**
```javascript
const base64Data = signature_data.replace(/^data:image\/\w+;base64,/, "");
const signatureBuffer = Buffer.from(base64Data, 'base64');
```

**After:**
```javascript
const signatureBufferWithTimestamp = await addTimestampToSignature(signature_data);
```

## How It Works

1. **User signs** on the intake form using the SignaturePad component
2. **Frontend sends** base64 PNG data to `/api/submit-page1`
3. **Backend processes** the signature:
   - Decodes the base64 image
   - Creates a new canvas with extra space at bottom
   - Draws the original signature
   - Adds timestamp text below the signature
   - Converts to PNG buffer
4. **Uploads to S3** at `{first_name}_{last_name}_{id}/Signatures/signature.png`
5. **Saves to database** in the `documents` table with category "Legal"

## File Format
- **Format**: PNG (unchanged)
- **Dimensions**: Original width × (Original height + 40px)
- **Background**: White (#ffffff)
- **Timestamp area**: 40px height at bottom

## No Overlap Guarantee
The signature and timestamp are guaranteed not to overlap because:
- The canvas height is extended by 40px
- The original signature is drawn at position (0, 0)
- The timestamp is drawn at position (width/2, originalHeight + 25)
- There's a 25px buffer between the signature and timestamp text

## Testing
Tested successfully with a sample signature. The timestamp appears correctly formatted at the bottom of the image without overlapping the signature content.

## Example Output
```
┌─────────────────────────────┐
│                             │
│   [Signature Drawing]       │
│                             │
├─────────────────────────────┤
│  Signed on: 20/01/2026, 14:47:31  │
└─────────────────────────────┘
```

## Notes
- Timestamp uses server time (not client time) for accuracy
- Format is consistent with UK date/time standards
- The signature remains in PNG format as required
- No changes needed to the frontend code
- Backward compatible with existing signature storage structure
