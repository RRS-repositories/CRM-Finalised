import React from 'react';
import { useMarketingStore } from '../../stores/marketingStore';
import MarketingLayout from './MarketingLayout';
import OverviewDashboard from './OverviewDashboard';
import CampaignPerformance from './CampaignPerformance';
import CampaignDetail from './CampaignDetail';
import CreativePerformance from './CreativePerformance';
import LeadAnalytics from './LeadAnalytics';
import AICommandCentre from './AICommandCentre';
import SpendBudget from './SpendBudget';
import CreativeWarRoom from './CreativeWarRoom';
import PlacementOptimisation from './PlacementOptimisation';
import TimeOfDayHeatmap from './TimeOfDayHeatmap';
import EmotionalCycleCalendar from './EmotionalCycleCalendar';
import TikTokCommandCentre from './TikTokCommandCentre';
import ContentByPillar from './ContentByPillar';
import SparkAdsPipeline from './SparkAdsPipeline';
import CommentEngagement from './CommentEngagement';
import LiveStreamPlanning from './LiveStreamPlanning';
import BlendedPerformance from './BlendedPerformance';
import ROIBySource from './ROIBySource';
import UnifiedInbox from './UnifiedInbox';
import BotPerformance from './BotPerformance';
import ConversationIntelligence from './ConversationIntelligence';
import FollowUpPerformance from './FollowUpPerformance';
import CredentialHealth from './CredentialHealth';
import LenderPerformance from './LenderPerformance';

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
      {renderPage()}
    </MarketingLayout>
  );
};

export default Marketing;
