# EC2 Deployment Guide for CRM Application

This guide will help you deploy the CRM application to your EC2 instance.

## Prerequisites

- EC2 instance running (Ubuntu/Amazon Linux recommended)
- SSH access to your EC2 instance
- Node.js 18+ installed on EC2
- PostgreSQL database (AWS RDS) set up
- AWS S3 bucket created
- Anthropic API key

## Quick Deployment Steps

### 1. Connect to Your EC2 Instance

```bash
ssh -i your-key.pem ec2-user@13.61.34.149
```

### 2. Copy the Deployment Script

On your EC2 instance, create the deployment script:

```bash
nano deploy.sh
```

Copy the contents from `deploy-ec2.sh` in this repository, then make it executable:

```bash
chmod +x deploy.sh
```

### 3. Run the Deployment Script

```bash
./deploy.sh
```

The script will:
- Stop any running Node.js processes
- Clean up old deployment
- Clone fresh code from GitHub
- Install dependencies
- Prompt you to configure environment variables
- Initialize the database
- Build the frontend
- Start both backend and frontend with PM2

### 4. Configure Environment Variables

When prompted, edit the `.env` file with your actual credentials:

```bash
nano .env
```

Required variables:
```env
# Database Configuration (AWS RDS)
DB_HOST=your-rds-endpoint.rds.amazonaws.com
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=crm_database
DB_PORT=5432

# AWS S3 Configuration
AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET_NAME=your-bucket-name

# Anthropic API (Claude AI)
ANTHROPIC_API_KEY=your_anthropic_key

# Server Configuration
PORT=5000
NODE_ENV=production
```

### 5. Configure Security Groups

Ensure your EC2 security group allows inbound traffic on:
- Port 3000 (Frontend)
- Port 5000 (Backend API)
- Port 22 (SSH)

### 6. Access Your Application

- **Frontend**: http://13.61.34.149:3000
- **Backend API**: http://13.61.34.149:5000

## Manual Deployment (Alternative)

If you prefer to deploy manually:

```bash
# 1. Stop existing processes
pkill -f node

# 2. Clone repository
cd ~
rm -rf CRM-Finalised
git clone https://github.com/RRS-repositories/CRM-Finalised.git
cd CRM-Finalised

# 3. Install dependencies
npm install

# 4. Create .env file
cat > .env << 'EOL'
DB_HOST=your_rds_endpoint
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name
DB_PORT=5432
AWS_REGION=your_region
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
S3_BUCKET_NAME=your_bucket
ANTHROPIC_API_KEY=your_key
PORT=5000
NODE_ENV=production
EOL

# 5. Initialize database
node init_db.js

# 6. Build frontend
npm run build

# 7. Install PM2
npm install -g pm2

# 8. Start services
pm2 start server.js --name "crm-backend"
pm2 serve dist 3000 --name "crm-frontend" --spa

# 9. Save PM2 configuration
pm2 save
pm2 startup
```

## PM2 Management Commands

```bash
# View application status
pm2 status

# View logs
pm2 logs

# View specific app logs
pm2 logs crm-backend
pm2 logs crm-frontend

# Restart applications
pm2 restart all
pm2 restart crm-backend
pm2 restart crm-frontend

# Stop applications
pm2 stop all

# Delete applications from PM2
pm2 delete all
```

## Updating the Application

To update to the latest version:

```bash
cd ~/CRM-Finalised
git pull origin main
npm install
npm run build
pm2 restart all
```

## Troubleshooting

### Backend not connecting to database

1. Check your `.env` file has correct RDS endpoint
2. Verify security group allows EC2 to connect to RDS
3. Check logs: `pm2 logs crm-backend`

### Frontend shows connection errors

1. Verify backend is running: `pm2 status`
2. Check backend logs: `pm2 logs crm-backend`
3. Ensure port 5000 is accessible

### Application not accessible from browser

1. Check EC2 security group inbound rules
2. Verify applications are running: `pm2 status`
3. Check if ports are listening: `netstat -tulpn | grep -E '3000|5000'`

### Database initialization fails

1. Verify database credentials in `.env`
2. Check RDS security group allows EC2 connection
3. Ensure database exists: `psql -h your-rds-endpoint -U your-user -d postgres`

## Setting Up Custom Domain (Optional)

To use a custom domain instead of IP address:

1. Point your domain to EC2 IP (13.61.34.149)
2. Install and configure Nginx as reverse proxy
3. Set up SSL with Let's Encrypt

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx

# Configure Nginx
sudo nano /etc/nginx/sites-available/crm

# Add configuration:
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Enable site
sudo ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com
```

## Monitoring

Set up monitoring with PM2:

```bash
# Install PM2 monitoring
pm2 install pm2-logrotate

# Configure log rotation
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

# Monitor in real-time
pm2 monit
```

## Backup Strategy

Regular backups are important:

```bash
# Database backup
pg_dump -h your-rds-endpoint -U your-user -d your-database > backup_$(date +%Y%m%d).sql

# Upload to S3
aws s3 cp backup_$(date +%Y%m%d).sql s3://your-backup-bucket/
```

## Support

For issues or questions:
- Check application logs: `pm2 logs`
- Review this documentation
- Check GitHub repository issues

## Architecture Notes

The application uses:
- **Frontend**: React + Vite (served on port 3000)
- **Backend**: Express.js (running on port 5000)
- **Database**: PostgreSQL (AWS RDS)
- **Storage**: AWS S3 for documents
- **AI**: Anthropic Claude for AI assistant
- **Process Manager**: PM2 for process management

## Security Recommendations

1. **Never commit `.env` file** - it contains sensitive credentials
2. **Use strong database passwords**
3. **Restrict security group access** - only allow necessary IPs
4. **Keep Node.js and dependencies updated**
5. **Enable RDS encryption**
6. **Use IAM roles** instead of hardcoded AWS credentials when possible
7. **Set up CloudWatch** for monitoring and alerts
8. **Regular backups** of database and configuration

## Performance Optimization

For better performance:

1. **Enable Gzip compression** in Nginx
2. **Set up CloudFront** CDN for static assets
3. **Use RDS read replicas** for scaling
4. **Implement Redis** for caching
5. **Monitor with CloudWatch** and set up auto-scaling

---

**Last Updated**: January 2026
**Version**: 1.0.0
