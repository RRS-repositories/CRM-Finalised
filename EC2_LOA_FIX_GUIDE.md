# EC2 LOA PDF Generation Fix Guide

## Problem
LOA PDFs are not being generated and uploaded to S3 when running on EC2.

## Root Causes Identified

### 1. **S3 ACL Issue (CRITICAL)**
The code was using `ACL: 'public-read'` on S3 uploads, but most modern S3 buckets have ACLs disabled by default for security.

**Status**: ✅ FIXED in latest code
- Removed all `ACL: 'public-read'` parameters
- Changed to use presigned URLs instead of public URLs
- URLs now valid for 7 days (604800 seconds)

### 2. **Missing Puppeteer Dependencies**
Puppeteer requires system libraries that aren't installed by default on EC2 Linux instances.

**Status**: ⚠️ REQUIRES MANUAL FIX (see below)

### 3. **Missing Logo File**
The logo file `public/fac.png` might not be deployed to EC2.

**Status**: ⚠️ CHECK REQUIRED

### 4. **AWS Credentials/Permissions**
AWS credentials might be incorrect or lack S3 permissions.

**Status**: ⚠️ CHECK REQUIRED

---

## Step-by-Step Fix Instructions

### Step 1: Upload Fixed Code to EC2

SSH into your EC2 instance:

```bash
ssh -i your-key.pem ec2-user@13.61.34.149
```

Navigate to your app directory and pull the latest code:

```bash
cd ~/CRM-Finalised
git pull origin main
npm install
```

### Step 2: Install Puppeteer Dependencies

Run the fix script we created:

```bash
cd ~/CRM-Finalised
chmod +x fix-ec2-loa.sh
./fix-ec2-loa.sh
```

**OR manually install dependencies:**

For Amazon Linux 2:
```bash
sudo yum install -y \
    alsa-lib atk cups-libs gtk3 \
    libXcomposite libXcursor libXdamage libXext libXi libXrandr \
    libXScrnSaver libXtst pango \
    xorg-x11-fonts-100dpi xorg-x11-fonts-75dpi xorg-x11-fonts-cyrillic \
    xorg-x11-fonts-misc xorg-x11-fonts-Type1 xorg-x11-utils \
    nss libdrm libgbm mesa-libgbm
```

For Ubuntu:
```bash
sudo apt-get update
sudo apt-get install -y \
    chromium-browser chromium-codecs-ffmpeg-extra \
    libxss1 libnss3 libasound2 \
    libatk-bridge2.0-0 libgtk-3-0
```

### Step 3: Verify Logo File Exists

```bash
cd ~/CRM-Finalised
ls -la public/fac.png
```

If missing, copy it from your local machine:
```bash
# On your local machine:
scp -i your-key.pem public/fac.png ec2-user@13.61.34.149:~/CRM-Finalised/public/
```

### Step 4: Verify Environment Variables

Check your `.env` file has all required AWS variables:

```bash
cd ~/CRM-Finalised
cat .env | grep -E "AWS|S3"
```

Should show:
```env
AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=your_key_here
AWS_SECRET_ACCESS_KEY=your_secret_here
S3_BUCKET_NAME=your-bucket-name
```

### Step 5: Verify S3 Bucket Permissions

Your AWS IAM user/role needs these S3 permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    }
  ]
}
```

**Important**: Since we removed ACL support, make sure your S3 bucket **does NOT require ACLs**.

Test S3 access:
```bash
aws s3 ls s3://your-bucket-name --region eu-north-1
```

### Step 6: Rebuild and Restart

```bash
cd ~/CRM-Finalised
npm run build
pm2 restart all
```

### Step 7: Check Logs

Monitor the logs while testing:
```bash
pm2 logs crm-backend --lines 100
```

Look for:
- ✅ "Generated LOA PDF for [lender]: [filename]"
- ❌ Any errors related to Puppeteer, S3, or file system

---

## Testing LOA Generation

1. Log into your CRM at `http://13.61.34.149:3000`
2. Navigate to a contact
3. Generate an LOA link
4. Open the link and submit the form with selected lenders
5. Check the logs: `pm2 logs crm-backend`
6. Verify PDFs appear in S3 bucket under: `FirstName_LastName_ContactID/LOA/`

---

## Common Errors and Solutions

### Error: "Browser closed" or "Protocol error"
**Cause**: Missing Puppeteer dependencies
**Fix**: Run Step 2 above to install system libraries

### Error: "AccessControlListNotSupported" or "AccessDenied"
**Cause**: S3 bucket has ACLs disabled, or wrong permissions
**Fix**:
- ✅ Code already fixed (ACL removed)
- Just pull latest code and restart
- Verify IAM permissions (Step 5)

### Error: "ENOENT: no such file or directory, open 'public/fac.png'"
**Cause**: Logo file missing
**Fix**: Copy logo file (Step 3)

### Error: "InvalidAccessKeyId" or "SignatureDoesNotMatch"
**Cause**: Wrong AWS credentials
**Fix**:
- Update `.env` file with correct credentials
- Restart: `pm2 restart all`

### LOA PDFs generate but URLs don't work after 7 days
**Cause**: Presigned URLs expire after 7 days
**Solution**: This is expected behavior. For longer-lasting URLs, either:
1. Make S3 bucket public (not recommended)
2. Use S3 bucket policy to allow public read (better)
3. Regenerate presigned URLs periodically

---

## S3 Bucket Policy (Alternative to Presigned URLs)

If you prefer permanent public URLs instead of presigned URLs, you can:

1. **Update S3 bucket policy** (in AWS Console):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```

2. **Update server.js** to use public URLs:
   - Replace presigned URL generation with:
     ```javascript
     const pdfUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${pdfKey}`;
     ```

**Note**: This makes all files in your bucket publicly accessible. Only do this if you're comfortable with that security implication.

---

## Verify Everything Works

Run this checklist:

- [ ] Puppeteer dependencies installed
- [ ] Logo file exists at `public/fac.png`
- [ ] `.env` has correct AWS credentials
- [ ] S3 bucket accessible (test with `aws s3 ls`)
- [ ] Code updated and rebuilt (`git pull && npm run build`)
- [ ] App restarted (`pm2 restart all`)
- [ ] Test LOA form submission
- [ ] Check S3 bucket for PDFs
- [ ] Check PM2 logs show success messages

---

## Quick Diagnostics Script

Save this as `test-loa.sh` and run it:

```bash
#!/bin/bash
echo "=== LOA PDF Generation Diagnostics ==="
echo ""
echo "1. Checking Puppeteer dependencies..."
rpm -qa | grep -E "nss|libX|gtk3" | wc -l
echo ""
echo "2. Checking logo file..."
ls -lh public/fac.png 2>&1
echo ""
echo "3. Checking AWS env vars..."
grep -E "AWS|S3" .env | grep -v "SECRET" | head -3
echo ""
echo "4. Testing S3 access..."
aws s3 ls s3://$(grep S3_BUCKET .env | cut -d= -f2) --region $(grep AWS_REGION .env | cut -d= -f2) 2>&1 | head -5
echo ""
echo "5. Checking PM2 status..."
pm2 status
echo ""
echo "=== Recent errors in logs ==="
pm2 logs crm-backend --nostream --lines 20 | grep -i error
```

Run it:
```bash
chmod +x test-loa.sh
./test-loa.sh
```

---

## Support

If you're still having issues:

1. Check PM2 logs: `pm2 logs crm-backend --lines 200`
2. Look for detailed error messages (we added better logging)
3. Verify all checklist items above
4. Check AWS CloudWatch for S3 access logs

## Changes Made to Code

The following files were modified:

1. **server.js**:
   - ✅ Removed all `ACL: 'public-read'` parameters
   - ✅ Changed all S3 URL generation to use presigned URLs
   - ✅ Added detailed error logging for LOA generation
   - ✅ Fixed signature uploads
   - ✅ Fixed T&C PDF uploads
   - ✅ Fixed manual document uploads

2. **New files created**:
   - ✅ `fix-ec2-loa.sh` - Automated fix script
   - ✅ `EC2_LOA_FIX_GUIDE.md` - This guide

---

**Last Updated**: January 2026
