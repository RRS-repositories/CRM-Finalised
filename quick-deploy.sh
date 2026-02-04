#!/bin/bash
# Quick EC2 Deployment Commands
# Save this as: quick-deploy.sh

echo "========================================="
echo "CRM Quick Deployment to EC2"
echo "========================================="
echo ""
echo "EC2 IP: 13.61.34.149"
echo "Repository: https://github.com/RRS-repositories/CRM-Finalised.git"
echo ""
echo "Choose an option:"
echo "1) Fresh deployment (clean install)"
echo "2) Update existing deployment"
echo "3) Restart services"
echo "4) View logs"
echo "5) Check status"
echo "6) Stop all services"
echo ""
read -p "Enter choice [1-6]: " choice

case $choice in
  1)
    echo "Starting fresh deployment..."
    pkill -f node || true
    cd ~ && rm -rf CRM-Finalised
    git clone https://github.com/RRS-repositories/CRM-Finalised.git
    cd CRM-Finalised
    npm install
    echo "Please configure your .env file now:"
    nano .env
    node init_db.js
    npm run build
    npm install -g pm2
    pm2 start server.js --name "crm-backend"
    pm2 serve dist 3000 --name "crm-frontend" --spa
    pm2 save
    pm2 startup
    echo "Deployment complete!"
    pm2 status
    ;;
  2)
    echo "Updating deployment..."
    cd ~/CRM-Finalised
    git pull origin main
    npm install
    npm run build
    pm2 restart all
    echo "Update complete!"
    pm2 status
    ;;
  3)
    echo "Restarting services..."
    pm2 restart all
    pm2 status
    ;;
  4)
    echo "Viewing logs (Ctrl+C to exit)..."
    pm2 logs
    ;;
  5)
    echo "Service status:"
    pm2 status
    echo ""
    echo "Listening ports:"
    netstat -tulpn | grep -E '3000|5000'
    ;;
  6)
    echo "Stopping all services..."
    pm2 stop all
    pm2 status
    ;;
  *)
    echo "Invalid choice"
    ;;
esac
