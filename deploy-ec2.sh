#!/bin/bash

# EC2 Deployment Script for CRM Application
# This script will clean up the EC2 instance and deploy the application fresh

echo "========================================="
echo "EC2 CRM Deployment Script"
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Stop any running processes
echo -e "${YELLOW}Step 1: Stopping any running Node.js processes...${NC}"
pkill -f node || true
pkill -f vite || true

# Step 2: Clean up old deployment
echo -e "${YELLOW}Step 2: Cleaning up old deployment...${NC}"
cd ~ || exit
if [ -d "CRM-Finalised" ]; then
    echo "Removing old CRM-Finalised directory..."
    rm -rf CRM-Finalised
fi

# Step 3: Clone fresh from GitHub
echo -e "${YELLOW}Step 3: Cloning fresh repository from GitHub...${NC}"
git clone https://github.com/RRS-repositories/CRM-Finalised.git
cd CRM-Finalised || exit

# Step 4: Install dependencies
echo -e "${YELLOW}Step 4: Installing dependencies...${NC}"
npm install

# Step 5: Create .env file
echo -e "${YELLOW}Step 5: Creating .env file...${NC}"
cat > .env << 'EOL'
# Database Configuration (AWS RDS)
DB_HOST=your_rds_endpoint_here
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name
DB_PORT=5432

# AWS S3 Configuration
AWS_REGION=your_aws_region
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET_NAME=your_bucket_name

# Anthropic API (Claude AI)
ANTHROPIC_API_KEY=your_anthropic_key

# Server Configuration
PORT=5000
NODE_ENV=production
EOL

echo -e "${RED}IMPORTANT: Please edit the .env file with your actual credentials!${NC}"
echo -e "${YELLOW}Run: nano .env${NC}"
read -p "Press Enter after you've updated the .env file..."

# Step 6: Initialize Database
echo -e "${YELLOW}Step 6: Initializing database...${NC}"
node init_db.js

# Step 7: Build the frontend
echo -e "${YELLOW}Step 7: Building frontend application...${NC}"
npm run build

# Step 8: Install PM2 for process management
echo -e "${YELLOW}Step 8: Installing PM2 for process management...${NC}"
npm install -g pm2

# Step 9: Start the backend server with PM2
echo -e "${YELLOW}Step 9: Starting backend server with PM2...${NC}"
pm2 start server.js --name "crm-backend"

# Step 10: Serve the frontend with PM2
echo -e "${YELLOW}Step 10: Starting frontend server with PM2...${NC}"
pm2 serve dist 3000 --name "crm-frontend" --spa

# Step 11: Save PM2 configuration
echo -e "${YELLOW}Step 11: Saving PM2 configuration...${NC}"
pm2 save
pm2 startup

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Backend API: http://13.61.34.149:5000"
echo "Frontend App: http://13.61.34.149:3000"
echo ""
echo "PM2 Commands:"
echo "  pm2 status          - Check application status"
echo "  pm2 logs            - View logs"
echo "  pm2 restart all     - Restart all services"
echo "  pm2 stop all        - Stop all services"
echo ""
