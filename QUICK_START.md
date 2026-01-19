# 🚀 EC2 Deployment - Quick Start Guide

## What Was Fixed

Your application had **hardcoded localhost URLs** that prevented it from working on EC2. I've fixed this by:

1. ✅ Created centralized API configuration (`src/config.ts`)
2. ✅ Updated all 7 files that referenced localhost
3. ✅ Added automatic environment detection (dev vs production)
4. ✅ Created deployment scripts
5. ✅ Pushed all changes to GitHub

## 📋 Pre-Deployment Checklist

Before deploying, make sure you have:

- [ ] EC2 instance running (Ubuntu/Amazon Linux)
- [ ] SSH key to access EC2
- [ ] PostgreSQL database (AWS RDS) endpoint
- [ ] AWS S3 bucket name
- [ ] Anthropic API key
- [ ] Security group configured (ports 22, 3000, 5000)

## 🎯 Deployment Steps

### Step 1: Connect to EC2

```bash
ssh -i /path/to/your-key.pem ec2-user@13.61.34.149
```

### Step 2: Download and Run Deployment Script

```bash
# Download the quick deploy script
curl -o quick-deploy.sh https://raw.githubusercontent.com/RRS-repositories/CRM-Finalised/main/quick-deploy.sh

# Make it executable
chmod +x quick-deploy.sh

# Run it
./quick-deploy.sh
```

Choose option **1** for fresh deployment.

### Step 3: Configure Environment Variables

When prompted, fill in your `.env` file:

```env
# Database (REQUIRED)
DB_HOST=your-database.rds.amazonaws.com
DB_USER=postgres
DB_PASSWORD=YourStrongPassword123
DB_NAME=crm_database
DB_PORT=5432

# AWS S3 (REQUIRED)
AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=your-bucket-name

# AI (REQUIRED)
ANTHROPIC_API_KEY=sk-ant-...

# Server
PORT=5000
NODE_ENV=production
```

### Step 4: Verify Deployment

After deployment completes, check:

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

### Step 5: Access Your Application

Open in browser:
- **Frontend**: http://13.61.34.149:3000
- **Backend API**: http://13.61.34.149:5000/api/contacts (should return JSON)

## 🔧 Common Issues & Solutions

### Issue: "Cannot connect to database"

**Solution:**
1. Check RDS security group allows EC2 IP
2. Verify `.env` has correct DB_HOST
3. Test connection: `psql -h your-rds-endpoint -U postgres`

### Issue: "Frontend shows blank page"

**Solution:**
1. Check if backend is running: `pm2 status`
2. View backend logs: `pm2 logs crm-backend`
3. Restart: `pm2 restart all`

### Issue: "Port already in use"

**Solution:**
```bash
# Kill processes on ports
sudo kill -9 $(sudo lsof -t -i:3000)
sudo kill -9 $(sudo lsof -t -i:5000)

# Restart PM2
pm2 restart all
```

### Issue: "npm install fails"

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

## 📊 Monitoring Commands

```bash
# View all logs in real-time
pm2 logs

# View specific service logs
pm2 logs crm-backend
pm2 logs crm-frontend

# Monitor CPU/Memory usage
pm2 monit

# Check service status
pm2 status

# Restart services
pm2 restart all

# Stop services
pm2 stop all
```

## 🔄 Updating Your Application

When you make changes and push to GitHub:

```bash
cd ~/CRM-Finalised
git pull origin main
npm install
npm run build
pm2 restart all
```

Or use the quick script:
```bash
./quick-deploy.sh
# Choose option 2
```

## 🔒 Security Checklist

- [ ] Change default database password
- [ ] Restrict security group to your IP only (for testing)
- [ ] Never commit `.env` file to GitHub
- [ ] Enable RDS encryption
- [ ] Set up automated backups
- [ ] Configure CloudWatch alerts

## 🌐 Setting Up Custom Domain (Optional)

If you want to use `crm.yourdomain.com` instead of IP:

1. Point domain A record to `13.61.34.149`
2. Install Nginx: `sudo apt install nginx`
3. Configure reverse proxy (see EC2_DEPLOYMENT.md)
4. Get SSL certificate: `sudo certbot --nginx`

## 📞 Need Help?

1. Check logs: `pm2 logs`
2. Review `EC2_DEPLOYMENT.md` for detailed guide
3. Check `DEPLOYMENT_CHANGES.md` for what was changed
4. Verify security group settings in AWS Console

## 🎉 Success Indicators

Your deployment is successful when:

✅ `pm2 status` shows both services "online"
✅ http://13.61.34.149:3000 loads the login page
✅ You can log in with: `info@fastactionclaims.co.uk` / `Fastactionclaims123!`
✅ Dashboard loads with data
✅ No errors in `pm2 logs`

## 📝 Quick Reference

| Command | Purpose |
|---------|---------|
| `pm2 status` | Check if services are running |
| `pm2 logs` | View application logs |
| `pm2 restart all` | Restart both services |
| `pm2 stop all` | Stop all services |
| `pm2 save` | Save current PM2 configuration |
| `./quick-deploy.sh` | Interactive deployment menu |

## 🔗 Important URLs

- **Repository**: https://github.com/RRS-repositories/CRM-Finalised.git
- **Frontend**: http://13.61.34.149:3000
- **Backend**: http://13.61.34.149:5000
- **AWS Console**: https://console.aws.amazon.com

---

**Last Updated**: January 2026
**Your EC2 IP**: 13.61.34.149

Good luck with your deployment! 🚀
