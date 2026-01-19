# 🚀 EC2 Deployment Commands - Copy & Paste Guide

## Your EC2 Details
- **IP Address**: 13.61.34.149
- **Repository**: https://github.com/RRS-repositories/CRM-Finalised.git

---

## Step 1: Connect to EC2

```bash
ssh -i /path/to/your-key.pem ec2-user@13.61.34.149
```

Or if using Ubuntu:
```bash
ssh -i /path/to/your-key.pem ubuntu@13.61.34.149
```

---

## Step 2: Install Node.js (if not installed)

```bash
# Update system
sudo yum update -y  # For Amazon Linux
# OR
sudo apt update -y  # For Ubuntu

# Install Node.js 18+
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -  # Amazon Linux
# OR
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -  # Ubuntu

sudo yum install -y nodejs  # Amazon Linux
# OR
sudo apt install -y nodejs  # Ubuntu

# Verify installation
node --version
npm --version
```

---

## Step 3: Clean Up Old Deployment

```bash
# Stop any running Node processes
pkill -f node || true

# Remove old directory
cd ~
rm -rf CRM-Finalised
```

---

## Step 4: Clone Repository

```bash
git clone https://github.com/RRS-repositories/CRM-Finalised.git
cd CRM-Finalised
```

---

## Step 5: Install Dependencies

```bash
npm install
```

---

## Step 6: Create .env File

```bash
nano .env
```

**Copy and paste this, then update with your actual values:**

```env
# Server Configuration
PORT=5000

# AWS RDS PostgreSQL Database
DB_HOST=your-rds-endpoint.rds.amazonaws.com
DB_PORT=5432
DB_NAME=your_database_name
DB_USER=postgres
DB_PASSWORD=your_db_password
DB_SSL=true

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=eu-north-1
S3_BUCKET_NAME=your-bucket-name

# CORS Configuration
ALLOWED_ORIGINS=http://13.61.34.149:3000,http://localhost:3000

# AI Configuration
ANTHROPIC_API_KEY=your_anthropic_api_key
```

**Save and exit**: Press `Ctrl+X`, then `Y`, then `Enter`

---

## Step 7: Initialize Database

```bash
node init_db.js
```

You should see:
```
Database initialization complete!
```

---

## Step 8: Build Frontend

```bash
npm run build
```

Wait for build to complete (~1-2 minutes)

---

## Step 9: Install PM2

```bash
sudo npm install -g pm2
```

---

## Step 10: Start Backend

```bash
pm2 start server.js --name "crm-backend"
```

---

## Step 11: Start Frontend

```bash
pm2 serve dist 3000 --name "crm-frontend" --spa
```

---

## Step 12: Save PM2 Configuration

```bash
pm2 save
pm2 startup
```

**Important**: Copy and run the command that PM2 outputs (it will look like):
```bash
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ec2-user --hp /home/ec2-user
```

---

## Step 13: Verify Deployment

```bash
pm2 status
```

You should see:
```
┌─────┬──────────────┬─────────┬─────────┬──────────┐
│ id  │ name         │ status  │ restart │ uptime   │
├─────┼──────────────┼─────────┼─────────┼──────────┤
│ 0   │ crm-backend  │ online  │ 0       │ 10s      │
│ 1   │ crm-frontend │ online  │ 0       │ 8s       │
└─────┴──────────────┴─────────┴─────────┴──────────┘
```

---

## Step 14: Check Logs

```bash
# View all logs
pm2 logs

# View backend logs only
pm2 logs crm-backend

# View frontend logs only
pm2 logs crm-frontend
```

Press `Ctrl+C` to exit logs

---

## Step 15: Configure Security Group

**In AWS Console:**

1. Go to EC2 → Security Groups
2. Find your instance's security group
3. Add Inbound Rules:
   - Type: Custom TCP, Port: 3000, Source: 0.0.0.0/0 (or your IP)
   - Type: Custom TCP, Port: 5000, Source: 0.0.0.0/0 (or your IP)
   - Type: SSH, Port: 22, Source: Your IP

---

## Step 16: Access Your Application

Open in browser:
```
http://13.61.34.149:3000
```

Login with:
```
Email: info@fastactionclaims.co.uk
Password: Fastactionclaims123!
```

---

## 🔧 Useful PM2 Commands

```bash
# Check status
pm2 status

# View logs
pm2 logs

# Restart all
pm2 restart all

# Restart specific service
pm2 restart crm-backend
pm2 restart crm-frontend

# Stop all
pm2 stop all

# Delete all from PM2
pm2 delete all

# Monitor CPU/Memory
pm2 monit
```

---

## 🔄 Update Application (After Code Changes)

```bash
cd ~/CRM-Finalised
git pull origin main
npm install
npm run build
pm2 restart all
```

---

## 🐛 Troubleshooting

### Backend won't start
```bash
pm2 logs crm-backend
# Check for database connection errors
```

### Frontend shows blank page
```bash
pm2 logs crm-frontend
# Check if build completed successfully
```

### Can't connect to database
```bash
# Test database connection
psql -h rowan-rose-solicitors-clients-list.cjme82cqwljz.eu-north-1.rds.amazonaws.com -U postgres -d client_credentials
```

### Port already in use
```bash
# Kill processes on ports
sudo lsof -ti:3000 | xargs kill -9
sudo lsof -ti:5000 | xargs kill -9
pm2 restart all
```

---

## ✅ Success Checklist

- [ ] EC2 instance accessible via SSH
- [ ] Node.js installed (v18+)
- [ ] Repository cloned
- [ ] Dependencies installed
- [ ] .env file created with correct values
- [ ] Database initialized successfully
- [ ] Frontend built successfully
- [ ] PM2 installed
- [ ] Both services running (`pm2 status` shows "online")
- [ ] Security group configured (ports 3000, 5000, 22)
- [ ] Application accessible at http://13.61.34.149:3000
- [ ] Can log in successfully

---

**Need Help?** Check logs with `pm2 logs` and review the error messages.

Good luck! 🚀
