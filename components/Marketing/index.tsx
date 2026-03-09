import React, { lazy, Suspense } from 'react';
import { useMarketingStore } from '../../stores/marketingStore';
import MarketingLayout from './MarketingLayout';

// === PERFORMANCE: Lazy-load all Marketing sub-pages ===
// Only the active page's JS is loaded, saving ~200KB+ of parsing per page switch
const OverviewDashboard = lazy(() => import('./OverviewDashboard'));
const CampaignPerformance = lazy(() => import('./CampaignPerformance'));
const CampaignDetail = lazy(() => import('./CampaignDetail'));
const CreativePerformance = lazy(() => import('./CreativePerformance'));
const LeadAnalytics = lazy(() => import('./LeadAnalytics'));
const AICommandCentre = lazy(() => import('./AICommandCentre'));
const SpendBudget = lazy(() => import('./SpendBudget'));
const CreativeWarRoom = lazy(() => import('./CreativeWarRoom'));
const PlacementOptimisation = lazy(() => import('./PlacementOptimisation'));
const TimeOfDayHeatmap = lazy(() => import('./TimeOfDayHeatmap'));
const EmotionalCycleCalendar = lazy(() => import('./EmotionalCycleCalendar'));
const TikTokCommandCentre = lazy(() => import('./TikTokCommandCentre'));
const ContentByPillar = lazy(() => import('./ContentByPillar'));
const SparkAdsPipeline = lazy(() => import('./SparkAdsPipeline'));
const CommentEngagement = lazy(() => import('./CommentEngagement'));
const LiveStreamPlanning = lazy(() => import('./LiveStreamPlanning'));
const BlendedPerformance = lazy(() => import('./BlendedPerformance'));
const ROIBySource = lazy(() => import('./ROIBySource'));
const UnifiedInbox = lazy(() => import('./UnifiedInbox'));
const BotPerformance = lazy(() => import('./BotPerformance'));
const ConversationIntelligence = lazy(() => import('./ConversationIntelligence'));
const FollowUpPerformance = lazy(() => import('./FollowUpPerformance'));
const CredentialHealth = lazy(() => import('./CredentialHealth'));
const LenderPerformance = lazy(() => import('./LenderPerformance'));

const SubPageLoader = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-6 h-6 border-2 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin" />
  </div>
);

const Marketing: React.FC = () => {
  const { currentPage } = useMarketingStore();

  const renderPage = () => {
    switch (currentPage) {
      case 'overview':
        return <OverviewDashboard />;
      case 'campaigns':
        return <CampaignPerformance />;
      case 'campaign-detail':
        return <CampaignDetail />;
      case 'creatives':
        return <CreativePerformance />;
      case 'leads':
        return <LeadAnalytics />;
      case 'spend-budget':
        return <SpendBudget />;
      case 'ai-centre':
        return <AICommandCentre />;
      case 'creative-war-room':
        return <CreativeWarRoom />;
      case 'placement':
        return <PlacementOptimisation />;
      case 'time-of-day':
        return <TimeOfDayHeatmap />;
      case 'emotional-cycle':
        return <EmotionalCycleCalendar />;
      case 'tiktok-command':
        return <TikTokCommandCentre />;
      case 'spark-pipeline':
        return <SparkAdsPipeline />;
      case 'content-pillars':
        return <ContentByPillar />;
      case 'comment-engagement':
        return <CommentEngagement />;
      case 'live-streams':
        return <LiveStreamPlanning />;
      case 'blended-performance':
        return <BlendedPerformance />;
      case 'roi-by-source':
        return <ROIBySource />;
      case 'lender-performance':
        return <LenderPerformance />;
      case 'credential-health':
        return <CredentialHealth />;
      case 'unified-inbox':
        return <UnifiedInbox />;
      case 'bot-performance':
        return <BotPerformance />;
      case 'followup-performance':
        return <FollowUpPerformance />;
      case 'conversation-intelligence':
        return <ConversationIntelligence />;
      default:
        return <OverviewDashboard />;
    }
  };

  return (
    <MarketingLayout>
      <Suspense fallback={<SubPageLoader />}>
        {renderPage()}
      </Suspense>
    </MarketingLayout>
  );
};

export default Marketing;
