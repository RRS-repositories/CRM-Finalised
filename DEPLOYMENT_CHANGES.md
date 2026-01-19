# Deployment Changes Summary

## Changes Made for Cloud Deployment

### 1. Fixed Localhost References
All hardcoded `localhost` URLs have been replaced with a centralized configuration that automatically detects the environment:

**Files Updated:**
- `src/config.ts` (NEW) - Centralized API configuration
- `services/intakeApi.ts` - Now uses `API_ENDPOINTS.api`
- `services/emailService.ts` - Now uses `API_ENDPOINTS.base`
- `components/Documents.tsx` - Now uses `API_ENDPOINTS.api`
- `components/BulkImport.tsx` - Now uses `API_ENDPOINTS.api`
- `components/AIAssistant.tsx` - Now uses `API_ENDPOINTS.base`
- `context/CRMContext.tsx` - Now uses `API_ENDPOINTS.api`

### 2. Environment Detection Logic
The application now automatically detects whether it's running in development or production:

```typescript
// Development: localhost or 127.0.0.1
// Production: Uses current window.location (works on any IP/domain)
const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
```

### 3. Deployment Scripts
- `deploy-ec2.sh` - Automated deployment script for EC2
- `EC2_DEPLOYMENT.md` - Comprehensive deployment guide

## How It Works

### Development Mode (Local)
When running on `localhost:5173`, the app connects to:
- Backend API: `http://localhost:5000`

### Production Mode (EC2)
When running on `13.61.34.149:3000`, the app connects to:
- Backend API: `http://13.61.34.149:5000`

This works automatically without any code changes!

## Deployment Instructions

### Quick Start
1. SSH into EC2: `ssh -i your-key.pem ec2-user@13.61.34.149`
2. Run: `./deploy-ec2.sh`
3. Configure `.env` file when prompted
4. Access at: `http://13.61.34.149:3000`

### What the Script Does
1. Stops running Node processes
2. Cleans up old deployment
3. Clones fresh from GitHub
4. Installs dependencies
5. Creates `.env` template
6. Initializes database
7. Builds frontend
8. Starts with PM2

## Environment Variables Required

```env
DB_HOST=your-rds-endpoint.rds.amazonaws.com
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=crm_database
DB_PORT=5432

AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
S3_BUCKET_NAME=your-bucket

ANTHROPIC_API_KEY=your_key

PORT=5000
NODE_ENV=production
```

## Security Group Configuration

Ensure EC2 security group allows:
- Port 3000 (Frontend)
- Port 5000 (Backend API)
- Port 22 (SSH)

## Testing Checklist

After deployment, verify:
- [ ] Frontend loads at http://13.61.34.149:3000
- [ ] Backend API responds at http://13.61.34.149:5000
- [ ] Login functionality works
- [ ] Database connection successful
- [ ] S3 document upload works
- [ ] AI assistant connects

## Rollback Plan

If deployment fails:
```bash
pm2 stop all
cd ~/CRM-Finalised
git checkout <previous-commit>
npm install
npm run build
pm2 restart all
```

## Monitoring

```bash
pm2 status          # Check app status
pm2 logs            # View all logs
pm2 logs crm-backend    # Backend logs
pm2 logs crm-frontend   # Frontend logs
pm2 monit           # Real-time monitoring
```

## Next Steps

1. Set up custom domain (optional)
2. Configure SSL with Let's Encrypt
3. Set up automated backups
4. Configure CloudWatch monitoring
5. Implement log rotation

---

**Deployment Date**: January 2026
**EC2 IP**: 13.61.34.149
**Repository**: https://github.com/RRS-repositories/CRM-Finalised.git
