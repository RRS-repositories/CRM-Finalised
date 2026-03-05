import { Router } from 'express';
import accountsRouter from './accounts.js';
import campaignsRouter from './campaigns.js';
import metricsRouter from './metrics.js';
import leadsRouter from './leads.js';
import adsRouter from './ads.js';
import aiReportsRouter from './ai-reports.js';
import audiencesRouter from './audiences.js';
import tiktokContentRouter from './tiktok-content.js';
import sparkAdsRouter from './spark-ads.js';
import tiktokCommentsRouter from './tiktok-comments.js';
import blendedRouter from './blended.js';
import conversationsRouter from './conversations.js';
import webhooksRouter from './webhooks.js';
import chatbotRouter from './chatbot.js';
import followupsRouter from './followups.js';
import credentialsRouter from './credentials.js';
import financialsRouter from './financials.js';
import lenderIntelRouter from './lender-intel.js';

const router = Router();

// Sub-routers
router.use('/accounts', accountsRouter);
router.use('/campaigns', campaignsRouter);
router.use('/metrics', metricsRouter);
router.use('/leads', leadsRouter);
router.use('/ads', adsRouter);
router.use('/ai-reports', aiReportsRouter);
router.use('/audiences', audiencesRouter);
router.use('/tiktok', tiktokContentRouter);
router.use('/spark-ads', sparkAdsRouter);
router.use('/tiktok-comments', tiktokCommentsRouter);
router.use('/blended', blendedRouter);
router.use('/conversations', conversationsRouter);
router.use('/webhooks', webhooksRouter);
router.use('/chatbot', chatbotRouter);
router.use('/followups', followupsRouter);
router.use('/credentials', credentialsRouter);
router.use('/financials', financialsRouter);
router.use('/lender-intelligence', lenderIntelRouter);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', module: 'marketing', timestamp: new Date().toISOString() });
});

export default router;
