# Fresh EC2 Instance Setup & CRM Deployment Guide

## Step 1: Terminate Old Instance

1. Go to EC2 Console → Instances
2. Select instance `i-0d25a2a189b6d0694` (fastaction-crm-server)
3. Instance State → Terminate instance
4. Confirm termination

## Step 2: Launch New EC2 Instance

### Instance Configuration

1. **Click "Launch instances"**

2. **Name and tags:**
   - Name: `crm-server` (or your preferred name)

3. **Application and OS Images (AMI):**
   - Select: **Ubuntu Server 24.04 LTS** (Free tier eligible)
   - Architecture: 64-bit (x86)

4. **Instance type:**
   - Select: **t3.micro** (or t2.micro for free tier)
   - For production: Consider t3.small or larger

5. **Key pair (login):**
   - **IMPORTANT:** Create a new key pair or use existing
   - If creating new:
     - Name: `crm-key`
     - Type: RSA
     - Format: `.pem`
     - **Download and save** to `~/Desktop/crm-key.pem`
     - Run: `chmod 400 ~/Desktop/crm-key.pem`

6. **Network settings - CRITICAL:**
   - Click "Edit"
   - VPC: Use default or your existing VPC
   - Subnet: **Choose a PUBLIC subnet** (has route to Internet Gateway)
   - Auto-assign public IP: **Enable**
   
   **Security group (firewall rules):**
   - Create new security group or use existing
   - Name: `crm-security-group`
   - Description: CRM application security group
   
   **Add these inbound rules:**
   - SSH (Port 22): Source = **My IP** (your current IP)
   - Custom TCP (Port 3000): Source = **0.0.0.0/0** (Frontend)
   - Custom TCP (Port 5000): Source = **0.0.0.0/0** (Backend API)
   - HTTP (Port 80): Source = **0.0.0.0/0** (Optional, for future Nginx)
   - HTTPS (Port 443): Source = **0.0.0.0/0** (Optional, for future SSL)

7. **Configure storage:**
   - Size: **20 GB** minimum (30 GB recommended)
   - Volume type: gp3 (General Purpose SSD)

8. **Advanced details:**
   - Leave defaults or adjust as needed

9. **Click "Launch instance"**

10. **Wait for instance to be running** (2-3 minutes)

## Step 3: Verify Instance Connectivity

### Get Instance Details

1. Go to EC2 Console → Instances
2. Select your new instance
3. Note the **Public IPv4 address** (e.g., 13.61.34.149)
4. Wait until **Status checks** show "2/2 checks passed"

### Test SSH Connection

```bash
# Replace with your actual IP and key file
ssh -i ~/Desktop/crm-key.pem ubuntu@YOUR_INSTANCE_IP
```

**If connection fails:**
- Check security group has SSH rule for your IP
- Verify instance is in a public subnet
- Check route table has route to Internet Gateway (0.0.0.0/0 → igw-xxx)
- Check Network ACL allows inbound/outbound on port 22
- Try EC2 Instance Connect from AWS Console

## Step 4: Initial Server Setup

Once connected via SSH:

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x

# Install Git
sudo apt install -y git

# Install PM2 globally
sudo npm install -g pm2

# Install PostgreSQL client (for database operations)
sudo apt install -y postgresql-client

# Install Puppeteer dependencies (for PDF generation)
sudo apt install -y \
  chromium-browser \
  libx11-xcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxi6 \
  libxtst6 \
  libnss3 \
  libcups2 \
  libxss1 \
  libxrandr2 \
  libasound2 \
  libpangocairo-1.0-0 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libgtk-3-0
```

## Step 5: Deploy CRM Application

### Clone Repository

```bash
cd ~
git clone https://github.com/RRS-repositories/CRM-Finalised.git
cd CRM-Finalised
```

**If repository is private:**
```bash
# Use personal access token
git clone https://YOUR_TOKEN@github.com/RRS-repositories/CRM-Finalised.git
```

### Install Dependencies

```bash
npm install
```

### Configure Environment Variables

Create `.env` file with your credentials:

```bash
nano .env
```

Add the following (replace with your actual values):

```env
# Database Configuration (AWS RDS)
DB_HOST=your-rds-endpoint.eu-north-1.rds.amazonaws.com
DB_USER=postgres
DB_PASSWORD=your_secure_password
DB_NAME=crm_database
DB_PORT=5432

# AWS S3 Configuration
AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
S3_BUCKET_NAME=your-s3-bucket-name

# Anthropic API (Claude AI)
ANTHROPIC_API_KEY=sk-ant-your-api-key

# Server Configuration
PORT=5000
NODE_ENV=production

# Frontend URL (update with your EC2 IP)
FRONTEND_URL=http://YOUR_INSTANCE_IP:3000
```

Save and exit (Ctrl+X, then Y, then Enter)

### Initialize Database

```bash
node init_db.js
```

Expected output: "Database initialized successfully!"

### Build Frontend

```bash
npm run build
```

This creates the `dist` folder with production-ready frontend files.

### Start Application with PM2

```bash
# Start backend server
pm2 start server.js --name "crm-backend"

# Start frontend server
pm2 serve dist 3000 --name "crm-frontend" --spa

# Save PM2 configuration
pm2 save

# Set PM2 to start on system boot
pm2 startup
# Copy and run the command it outputs
```

### Verify Application is Running

```bash
# Check PM2 status
pm2 status

# Should show:
# ┌─────┬──────────────────┬─────────┬─────────┐
# │ id  │ name             │ status  │ restart │
# ├─────┼──────────────────┼─────────┼─────────┤
# │ 0   │ crm-backend      │ online  │ 0       │
# │ 1   │ crm-frontend     │ online  │ 0       │
# └─────┴──────────────────┴─────────┴─────────┘

# Check logs
pm2 logs --lines 50
```

## Step 6: Access Your Application

Open in browser:
- **Frontend:** `http://YOUR_INSTANCE_IP:3000`
- **Backend API:** `http://YOUR_INSTANCE_IP:5000/api/contacts`

## Step 7: Push Local Changes to GitHub

Before deploying, make sure your local code is pushed to GitHub:

```bash
# On your local machine (Mac)
cd ~/Desktop/Rowan\ Rose\ Solicitors/CRM-Finalised

# Check status
git status

# Add all changes
git add .

# Commit changes
git commit -m "Latest CRM updates"

# Push to GitHub
git push origin main
```

Then on EC2, pull the latest changes:

```bash
cd ~/CRM-Finalised
git pull origin main
npm install
npm run build
pm2 restart all
```

## Common PM2 Commands

```bash
# View status
pm2 status

# View logs (all apps)
pm2 logs

# View specific app logs
pm2 logs crm-backend
pm2 logs crm-frontend

# Restart all apps
pm2 restart all

# Restart specific app
pm2 restart crm-backend

# Stop all apps
pm2 stop all

# Delete all apps from PM2
pm2 delete all

# Monitor in real-time
pm2 monit
```

## Updating Application

When you make changes:

```bash
# On local machine: commit and push
git add .
git commit -m "Description of changes"
git push origin main

# On EC2: pull and restart
cd ~/CRM-Finalised
git pull origin main
npm install  # Only if package.json changed
npm run build
pm2 restart all
```

## Troubleshooting

### SSH Connection Issues

**Problem:** "Connection timed out"
- Check security group has SSH rule for your IP
- Verify instance is in public subnet with Internet Gateway route
- Check Network ACL allows port 22
- Try EC2 Instance Connect from AWS Console

**Problem:** "Permission denied (publickey)"
- Verify key file permissions: `chmod 400 ~/Desktop/crm-key.pem`
- Use correct username: `ubuntu` for Ubuntu AMI
- Use correct key file path

### Application Not Accessible

**Problem:** Can't access frontend/backend from browser
- Check EC2 security group allows ports 3000 and 5000
- Verify apps are running: `pm2 status`
- Check logs: `pm2 logs`
- Test locally on EC2: `curl http://localhost:3000`

### Database Connection Issues

**Problem:** Backend can't connect to RDS
- Verify RDS security group allows inbound from EC2 security group
- Check `.env` file has correct DB_HOST endpoint
- Test connection: `psql -h YOUR_RDS_ENDPOINT -U postgres -d crm_database`
- Check RDS is publicly accessible (if EC2 is in different VPC)

### PM2 Process Crashes

**Problem:** App shows "errored" or "stopped" status
- Check logs: `pm2 logs crm-backend`
- Common issues:
  - Missing environment variables in `.env`
  - Database connection failure
  - Port already in use
  - Missing dependencies

### PDF Generation Fails

**Problem:** "Failed to launch browser" error
- Install Puppeteer dependencies (see Step 4)
- Run: `bash install_puppeteer_deps.sh`
- Check logs for specific error

## Security Best Practices

1. **Restrict SSH access:** Update security group SSH rule to only your IP
2. **Use strong passwords:** For database and all credentials
3. **Never commit `.env`:** Keep credentials out of Git
4. **Enable RDS encryption:** In RDS settings
5. **Regular backups:** Set up automated RDS snapshots
6. **Keep system updated:** Run `sudo apt update && sudo apt upgrade` regularly
7. **Use IAM roles:** Instead of hardcoded AWS credentials when possible
8. **Monitor logs:** Regularly check `pm2 logs` for errors

## Optional: Set Up Domain & SSL

If you have a domain name:

1. Point domain A record to EC2 IP
2. Install Nginx: `sudo apt install nginx`
3. Configure reverse proxy (see EC2_DEPLOYMENT.md)
4. Install SSL: `sudo apt install certbot python3-certbot-nginx`
5. Get certificate: `sudo certbot --nginx -d yourdomain.com`

## Support Resources

- **PM2 Documentation:** https://pm2.keymetrics.io/docs/usage/quick-start/
- **AWS EC2 Guide:** https://docs.aws.amazon.com/ec2/
- **Node.js Best Practices:** https://github.com/goldbergyoni/nodebestpractices

---

**Created:** January 2026  
**For:** CRM Application Deployment
