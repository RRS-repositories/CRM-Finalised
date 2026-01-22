#!/bin/bash
# Fix LOA PDF Generation on EC2
# This script installs Puppeteer dependencies and fixes common issues

echo "=========================================="
echo "Fixing LOA PDF Generation on EC2"
echo "=========================================="

# 1. Install Puppeteer dependencies for headless Chrome
echo ""
echo "1. Installing Puppeteer/Chrome dependencies..."
sudo yum install -y \
    alsa-lib \
    atk \
    cups-libs \
    gtk3 \
    libXcomposite \
    libXcursor \
    libXdamage \
    libXext \
    libXi \
    libXrandr \
    libXScrnSaver \
    libXtst \
    pango \
    xorg-x11-fonts-100dpi \
    xorg-x11-fonts-75dpi \
    xorg-x11-fonts-cyrillic \
    xorg-x11-fonts-misc \
    xorg-x11-fonts-Type1 \
    xorg-x11-utils \
    nss \
    libdrm \
    libgbm \
    mesa-libgbm

# For Ubuntu/Debian (if not Amazon Linux)
# Uncomment these if you're on Ubuntu:
# sudo apt-get update
# sudo apt-get install -y \
#     chromium-browser \
#     chromium-codecs-ffmpeg-extra \
#     libxss1 \
#     libnss3 \
#     libasound2 \
#     libatk-bridge2.0-0 \
#     libgtk-3-0

echo "✅ Puppeteer dependencies installed"

# 2. Check if logo file exists
echo ""
echo "2. Checking for logo file..."
if [ -f "public/fac.png" ]; then
    echo "✅ Logo file exists"
else
    echo "⚠️  WARNING: Logo file (public/fac.png) not found!"
    echo "   PDFs will be generated without logo"
fi

# 3. Check environment variables
echo ""
echo "3. Checking environment variables..."
if [ -f ".env" ]; then
    echo "✅ .env file exists"

    # Check required S3 variables
    if grep -q "AWS_ACCESS_KEY_ID" .env && grep -q "AWS_SECRET_ACCESS_KEY" .env && grep -q "S3_BUCKET_NAME" .env; then
        echo "✅ AWS S3 credentials configured"
    else
        echo "❌ ERROR: Missing AWS S3 credentials in .env"
        echo "   Required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME"
    fi
else
    echo "❌ ERROR: .env file not found!"
fi

# 4. Test S3 connectivity
echo ""
echo "4. Testing S3 connectivity..."
if command -v aws &> /dev/null; then
    source .env
    aws s3 ls s3://$S3_BUCKET_NAME --region $AWS_REGION 2>/dev/null
    if [ $? -eq 0 ]; then
        echo "✅ S3 bucket accessible"
    else
        echo "❌ ERROR: Cannot access S3 bucket"
        echo "   Check your AWS credentials and bucket name"
    fi
else
    echo "⚠️  AWS CLI not installed, skipping S3 test"
fi

# 5. Reinstall Puppeteer with Chrome
echo ""
echo "5. Reinstalling Puppeteer..."
cd ~/CRM-Finalised
npm install puppeteer --force

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Review any ERROR messages above"
echo "2. Restart your app: pm2 restart all"
echo "3. Check logs: pm2 logs crm-backend"
echo "4. Test LOA generation from the CRM"
echo ""
