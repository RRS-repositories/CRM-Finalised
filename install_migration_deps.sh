#!/bin/bash

echo "============================================"
echo "Installing Google Drive Migration Dependencies"
echo "============================================"
echo ""

npm install googleapis @google-cloud/local-auth

echo ""
echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Follow MIGRATION_SETUP.md to set up Google Cloud credentials"
echo "2. Download google-credentials.json and place it in this directory"
echo "3. Run: node migrate_drive_to_s3.js"
echo ""
