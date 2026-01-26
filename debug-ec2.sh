#!/bin/bash

# EC2 Debugging Script for 500 Error
# Run this on your EC2 instance to diagnose the issue

echo "=========================================="
echo "CRM Application Debugging Script"
echo "=========================================="
echo ""

# Check PM2 status
echo "1. Checking PM2 process status..."
pm2 status
echo ""

# Check backend logs
echo "2. Checking backend logs (last 50 lines)..."
pm2 logs crm-backend --lines 50 --nostream
echo ""

# Check if .env file exists
echo "3. Checking .env file..."
if [ -f .env ]; then
    echo "✓ .env file exists"
    echo "Environment variables configured:"
    grep -v "PASSWORD\|SECRET\|KEY" .env | grep "="
else
    echo "✗ .env file NOT FOUND!"
    echo "You need to create .env file with your credentials"
fi
echo ""

# Check database connectivity
echo "4. Testing database connection..."
if command -v psql &> /dev/null; then
    DB_HOST=$(grep DB_HOST .env | cut -d '=' -f2)
    DB_USER=$(grep DB_USER .env | cut -d '=' -f2)
    DB_NAME=$(grep DB_NAME .env | cut -d '=' -f2)
    
    if [ ! -z "$DB_HOST" ]; then
        echo "Testing connection to: $DB_HOST"
        PGPASSWORD=$(grep DB_PASSWORD .env | cut -d '=' -f2) psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT version();" 2>&1 | head -5
    else
        echo "DB_HOST not found in .env"
    fi
else
    echo "psql not installed, skipping database test"
fi
echo ""

# Check if ports are listening
echo "5. Checking if ports are listening..."
sudo netstat -tulpn | grep -E ':3000|:5000' || echo "Ports 3000/5000 not listening"
echo ""

# Check Node.js version
echo "6. Checking Node.js version..."
node --version
npm --version
echo ""

# Check disk space
echo "7. Checking disk space..."
df -h | grep -E 'Filesystem|/$'
echo ""

# Check memory usage
echo "8. Checking memory usage..."
free -h
echo ""

echo "=========================================="
echo "Debugging complete!"
echo "=========================================="
echo ""
echo "Common issues and fixes:"
echo "1. Missing .env file → Create it with your credentials"
echo "2. Database connection failed → Check RDS security group"
echo "3. Process crashed → Check PM2 logs above"
echo "4. Out of memory → Consider upgrading instance type"
echo ""
echo "To view real-time logs: pm2 logs"
echo "To restart apps: pm2 restart all"
