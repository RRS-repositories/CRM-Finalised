import { Router } from 'express';
import pool from '../../db.js';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// GET /api/marketing/ai-reports — list AI reports
router.get('/', async (req, res) => {
  try {
    const { report_type, platform, limit = 20, offset = 0 } = req.query;
    let sql = 'SELECT * FROM ai_reports';
    const conditions = [];
    const params = [];

    if (report_type) {
      params.push(report_type);
      conditions.push(`report_type = $${params.length}`);
    }
    if (platform) {
      params.push(platform);
      conditions.push(`platform = $${params.length}`);
    }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    params.push(parseInt(limit));
    sql += ` LIMIT $${params.length}`;
    params.push(parseInt(offset));
    sql += ` OFFSET $${params.length}`;

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[Marketing AI] GET / error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/ai-reports/latest — latest report of each type
router.get('/latest', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (report_type) *
      FROM ai_reports
      ORDER BY report_type, created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[Marketing AI] GET /latest error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/ai-reports/generate — generate a new AI report
router.post('/generate', async (req, res) => {
  try {
    const { report_type = 'daily_review', platform = 'all' } = req.body;

    // Gather metrics for Claude to analyze
    const { rows: recentMetrics } = await pool.query(`
      SELECT
        c.name AS campaign_name, c.platform, c.status, c.objective,
        SUM(dm.spend) AS spend, SUM(dm.impressions) AS impressions,
        SUM(dm.clicks) AS clicks, SUM(dm.leads) AS leads,
        CASE WHEN SUM(dm.impressions) > 0 THEN ROUND(SUM(dm.clicks)::numeric / SUM(dm.impressions) * 100, 2) ELSE 0 END AS ctr,
        CASE WHEN SUM(dm.leads) > 0 THEN ROUND(SUM(dm.spend)::numeric / SUM(dm.leads), 2) ELSE 0 END AS cpl,
        CASE WHEN SUM(dm.spend) > 0 THEN ROUND(SUM(dm.conversion_value)::numeric / SUM(dm.spend), 2) ELSE 0 END AS roas
      FROM daily_metrics dm
      JOIN campaigns c ON dm.campaign_id = c.id
      WHERE dm.date >= CURRENT_DATE - INTERVAL '7 days'
        ${platform !== 'all' ? 'AND dm.platform = $1' : ''}
      GROUP BY c.name, c.platform, c.status, c.objective
      ORDER BY spend DESC
      LIMIT 30
    `, platform !== 'all' ? [platform] : []);

    if (!recentMetrics.length) {
      return res.json({
        analysis: 'No campaign data available for the selected period. Connect your ad platforms and sync data to generate AI reports.',
        recommendations: [],
        flagged_campaigns: [],
      });
    }

    const metricsContext = JSON.stringify(recentMetrics, null, 2);

    const promptMap = {
      daily_review: `Analyze the last 7 days of ad campaign performance data below. Provide:
1. A concise executive summary (2-3 sentences)
2. Top 3 performing campaigns and why
3. Bottom 3 underperforming campaigns and specific concerns
4. 3-5 actionable recommendations with expected impact
5. Any anomalies or alerts (unusual spend spikes, CPL jumps, etc.)

Return JSON: { "analysis": "string", "recommendations": [...], "flagged_campaigns": [...], "top_performers": [...], "underperformers": [...], "suggested_actions": [...] }`,

      budget_recommendation: `Based on the campaign performance data below, provide budget reallocation recommendations:
1. Which campaigns should get more budget and why
2. Which campaigns should be reduced or paused
3. Optimal daily budget suggestions per campaign
4. Expected impact of recommended changes

Return JSON: { "analysis": "string", "recommendations": [...], "suggested_actions": [...] }`,

      creative_analysis: `Analyze the creative performance across campaigns below:
1. Which creative approaches are working best (by CTR and CPL)
2. Signs of creative fatigue
3. Creative testing recommendations
4. Content angle suggestions for new creatives

Return JSON: { "analysis": "string", "recommendations": [...], "suggested_actions": [...] }`,

      anomaly_alert: `Check the campaign data below for anomalies:
1. Unusual spend patterns
2. CPL or CPM spikes
3. Sudden performance drops
4. Budget pacing issues
5. Quality ranking concerns

Return JSON: { "analysis": "string", "flagged_campaigns": [...], "suggested_actions": [...] }`,

      weekly_summary: `Create a comprehensive weekly performance summary from the data below:
1. Overall performance trends (spend, leads, CPL, ROAS)
2. Platform comparison (Meta vs TikTok if both present)
3. Campaign winners and losers
4. Strategic recommendations for next week
5. Key metrics to watch

Return JSON: { "analysis": "string", "recommendations": [...], "top_performers": [...], "underperformers": [...], "suggested_actions": [...] }`,
    };

    const systemPrompt = promptMap[report_type] || promptMap.daily_review;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `${systemPrompt}\n\nCampaign Performance Data (last 7 days):\n${metricsContext}\n\nIMPORTANT: Return ONLY valid JSON, no markdown.`,
      }],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    let parsed;
    try {
      let jsonStr = text.trim();
      if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      parsed = JSON.parse(jsonStr.trim());
    } catch {
      parsed = { analysis: text, recommendations: [], flagged_campaigns: [] };
    }

    // Store report
    const { rows: [report] } = await pool.query(
      `INSERT INTO ai_reports (report_date, report_type, platform, analysis, recommendations, flagged_campaigns, top_performers, underperformers, suggested_actions)
       VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [report_type, platform, parsed.analysis || '',
       JSON.stringify(parsed.recommendations || []),
       JSON.stringify(parsed.flagged_campaigns || []),
       JSON.stringify(parsed.top_performers || []),
       JSON.stringify(parsed.underperformers || []),
       JSON.stringify(parsed.suggested_actions || [])]
    );

    res.json(report);
  } catch (err) {
    console.error('[Marketing AI] POST /generate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/ai-reports/ask — ask Claude about marketing data
router.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'question is required' });

    // Get recent metrics summary for context
    const { rows: summary } = await pool.query(`
      SELECT platform,
        SUM(spend) AS total_spend, SUM(leads) AS total_leads, SUM(impressions) AS total_impressions,
        SUM(clicks) AS total_clicks,
        CASE WHEN SUM(leads) > 0 THEN ROUND(SUM(spend)::numeric / SUM(leads), 2) ELSE 0 END AS avg_cpl,
        CASE WHEN SUM(spend) > 0 THEN ROUND(SUM(conversion_value)::numeric / SUM(spend), 2) ELSE 0 END AS roas
      FROM daily_metrics
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY platform
    `);

    const { rows: campaigns } = await pool.query(`
      SELECT c.name, c.platform, c.status,
        SUM(dm.spend) AS spend, SUM(dm.leads) AS leads,
        CASE WHEN SUM(dm.leads) > 0 THEN ROUND(SUM(dm.spend)::numeric / SUM(dm.leads), 2) ELSE 0 END AS cpl
      FROM campaigns c
      LEFT JOIN daily_metrics dm ON dm.campaign_id = c.id AND dm.date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY c.name, c.platform, c.status
      ORDER BY spend DESC NULLS LAST LIMIT 20
    `);

    const context = `Platform Summary (30d): ${JSON.stringify(summary)}\nTop Campaigns: ${JSON.stringify(campaigns)}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: 'You are an expert digital marketing analyst for a UK law firm running Meta and TikTok ads for irresponsible lending claims. Be concise, data-driven, and actionable. Use GBP for currency.',
      messages: [{
        role: 'user',
        content: `Context:\n${context}\n\nQuestion: ${question}`,
      }],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    res.json({ answer: text });
  } catch (err) {
    console.error('[Marketing AI] POST /ask error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
