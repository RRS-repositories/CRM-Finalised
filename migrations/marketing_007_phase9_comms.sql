-- Phase 9: Communications Infrastructure + Unified Inbox
-- Run: node -e "require('dotenv').config(); ..." (see Phase 8 pattern)

-- Communication channels
CREATE TABLE IF NOT EXISTS comm_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type VARCHAR(30) NOT NULL CHECK (channel_type IN ('fb_messenger', 'instagram_dm', 'whatsapp', 'email', 'sms', 'tiktok_dm')),
  platform_account_id VARCHAR(255),
  platform_account_name VARCHAR(255),
  access_token TEXT,
  webhook_url TEXT,
  webhook_verify_token VARCHAR(100),
  webhook_active BOOLEAN DEFAULT FALSE,
  bot_enabled BOOLEAN DEFAULT TRUE,
  bot_greeting TEXT,
  bot_operating_hours JSONB,
  human_fallback_enabled BOOLEAN DEFAULT TRUE,
  messages_per_day_limit INT DEFAULT 1000,
  messages_sent_today INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations (unified across all channels)
CREATE TABLE IF NOT EXISTS marketing_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES ad_leads(id) ON DELETE SET NULL,
  crm_client_id INT REFERENCES contacts(id) ON DELETE SET NULL,
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),

  primary_channel VARCHAR(30) CHECK (primary_channel IN ('fb_messenger', 'instagram_dm', 'whatsapp', 'email', 'sms', 'tiktok_dm')),
  channel_user_id VARCHAR(255),

  status VARCHAR(30) DEFAULT 'new' CHECK (status IN (
    'new', 'bot_active', 'bot_qualifying', 'bot_educating', 'bot_converting',
    'human_needed', 'human_active', 'registered', 'nurture', 'cold', 'closed'
  )),
  funnel_stage VARCHAR(30) DEFAULT 'engaged' CHECK (funnel_stage IN (
    'engaged', 'qualifying', 'qualified', 'educating', 'objection_handling',
    'converting', 'registered', 'dropped_off', 'unqualified', 'cold'
  )),
  bot_stage INT DEFAULT 1,

  qualification_data JSONB DEFAULT '{}',
  qualification_score INT DEFAULT 0,
  objections_raised JSONB DEFAULT '[]',

  source_platform VARCHAR(50) CHECK (source_platform IN (
    'facebook_ad', 'instagram_ad', 'tiktok_ad', 'tiktok_organic', 'tiktok_spark',
    'organic_search', 'direct', 'referral'
  )),
  source_campaign_id UUID,
  source_content_id UUID,

  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  last_bot_message_at TIMESTAMPTZ,
  last_human_message_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ,

  response_time_seconds INT,
  total_messages INT DEFAULT 0,
  bot_messages INT DEFAULT 0,
  human_messages INT DEFAULT 0,

  assigned_to VARCHAR(100),
  handoff_reason TEXT,
  handoff_at TIMESTAMPTZ,

  next_followup_at TIMESTAMPTZ,
  followup_count INT DEFAULT 0,
  max_followups INT DEFAULT 5,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages
CREATE TABLE IF NOT EXISTS marketing_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES marketing_conversations(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('lead', 'bot', 'human_agent')),
  channel VARCHAR(30) CHECK (channel IN ('fb_messenger', 'instagram_dm', 'whatsapp', 'email', 'sms', 'tiktok_dm')),

  message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN (
    'text', 'image', 'video', 'audio', 'document', 'template', 'quick_reply', 'button', 'location', 'contact'
  )),
  message_text TEXT,
  media_url TEXT,
  buttons JSONB,
  quick_replies JSONB,

  platform_message_id VARCHAR(255),
  bot_intent_detected VARCHAR(100),
  bot_confidence DECIMAL(3,2),
  bot_stage_at_send INT,

  delivery_status VARCHAR(20) DEFAULT 'sent' CHECK (delivery_status IN ('sent', 'delivered', 'read', 'failed', 'bounced')),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Qualification answers
CREATE TABLE IF NOT EXISTS qualification_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES marketing_conversations(id) ON DELETE CASCADE,
  question_key VARCHAR(50) NOT NULL,
  answer_text TEXT,
  answer_value VARCHAR(255),
  confidence VARCHAR(20) DEFAULT 'confirmed' CHECK (confidence IN ('confirmed', 'inferred', 'unclear')),
  asked_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  message_id UUID REFERENCES marketing_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Objection library
CREATE TABLE IF NOT EXISTS objection_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  objection_type VARCHAR(50) NOT NULL UNIQUE,
  trigger_phrases TEXT[] DEFAULT '{}',
  response_text TEXT NOT NULL,
  response_tone VARCHAR(20) DEFAULT 'reassuring' CHECK (response_tone IN ('reassuring', 'educational', 'empathetic', 'direct')),
  follow_up_question TEXT,
  times_used INT DEFAULT 0,
  resolution_rate DECIMAL(5,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed objection library
INSERT INTO objection_library (objection_type, trigger_phrases, response_text, response_tone, follow_up_question) VALUES
('cost_concern', ARRAY['how much', 'cost', 'afford', 'pay', 'expensive', 'free'], 'Great question! Our service is completely no-win, no-fee. You pay nothing upfront, and we only receive a fee if your claim is successful. There is zero financial risk to you.', 'reassuring', 'Would you like to know more about how the process works?'),
('credit_score_fear', ARRAY['credit score', 'credit rating', 'affect my credit'], 'Making a claim against irresponsible lending will NOT affect your credit score. In fact, if successful, any default markers related to irresponsible lending may be removed, which could actually improve your score.', 'educational', 'Is this something that has been worrying you?'),
('still_owe_money', ARRAY['still owe', 'paying off', 'still paying', 'in debt'], 'Yes, absolutely! Even if you still owe money, you can make a claim. If successful, any remaining balance could be written off, and you may receive additional compensation on top.', 'reassuring', 'Can I ask which lender you still have an outstanding balance with?'),
('too_good_to_be_true', ARRAY['scam', 'too good', 'sounds fake', 'legit', 'genuine'], 'I completely understand your caution — it is wise to be careful. Rowan Rose Solicitors is regulated by the Solicitors Regulation Authority (SRA). Irresponsible lending claims are a well-established legal right under the Consumer Credit Act.', 'direct', 'Would you like our SRA registration number so you can verify us independently?'),
('time_concern', ARRAY['how long', 'take long', 'time', 'quick', 'wait'], 'Most claims take between 8-16 weeks to resolve, though some straightforward cases can be faster. Once you register, we handle everything — you just need to answer a few initial questions.', 'direct', 'Would you like to get started? The sooner we begin, the sooner you could receive compensation.'),
('previous_rejection', ARRAY['tried before', 'rejected', 'turned down', 'denied', 'failed'], 'That is really common, and it does not mean your claim is not valid. Many people are initially rejected but succeed with proper legal representation. Lenders often reject claims hoping people will give up. Our legal team knows exactly how to build a strong case.', 'empathetic', 'Do you remember which lender rejected you, and roughly when that was?'),
('privacy_concern', ARRAY['will they know', 'confidential', 'private', 'lender find out'], 'Your claim is handled confidentially by our legal team. While the lender will be notified of the claim (this is a legal requirement), all communications go through us — they will not contact you directly about it.', 'reassuring', 'Is there anything else about the process you would like to understand?'),
('not_sure_if_qualifies', ARRAY['qualify', 'eligible', 'my situation', 'does this apply', 'not sure if'], 'Let me help you figure that out — it only takes a couple of minutes. Generally, if you took out credit (loans, credit cards, catalogues, overdrafts) and were experiencing gambling issues at the time, there is a strong chance you have a valid claim.', 'empathetic', 'Can I ask what type of credit you had and roughly when?'),
('want_to_think', ARRAY['think about it', 'not sure', 'maybe later', 'need time'], 'Of course, take all the time you need. Just so you know, registering is completely non-committal — it just lets us assess your situation. There is no obligation to proceed, and you can change your mind at any time.', 'reassuring', 'Would it help if I sent you some information you can read in your own time?'),
('partner_approval', ARRAY['partner', 'husband', 'wife', 'spouse', 'other half'], 'That makes total sense — it is a good idea to discuss important decisions together. Your partner might find it reassuring to know that this is risk-free and handled by SRA-regulated solicitors. Perhaps I could send some information you can share with them?', 'empathetic', 'Would a link to our website or some written information be helpful to share with them?'),
('already_paid_off', ARRAY['paid off', 'paid it back', 'cleared the debt', 'finished paying'], 'That is great news that the debt is cleared! But here is the important thing — if the lending was irresponsible in the first place, you may be entitled to have interest and charges refunded, PLUS compensation. The claim is about how the credit was given, not whether you paid it back.', 'educational', 'Would you like to check if your situation qualifies?'),
('bankruptcy_concern', ARRAY['bankrupt', 'bankruptcy', 'went bankrupt'], 'Even if you have been through bankruptcy, you may still be able to claim. The key factor is whether the lending was responsible at the time it was given. Our legal team can assess your specific situation and advise on the best approach.', 'educational', 'When did the bankruptcy occur, and which lenders were involved?'),
('iva_concern', ARRAY['iva', 'individual voluntary', 'arrangement'], 'Being in an IVA does not prevent you from making a claim, but there are some important considerations. If successful, compensation might need to go through your IVA supervisor. Our team has experience handling claims for people in IVAs and can guide you through it.', 'educational', 'Are you currently in an active IVA, or has it been completed?'),
('gambling_shame', ARRAY['embarrassed', 'ashamed', 'shame', 'judge', 'no one knows'], 'Please know there is absolutely no judgement here. Gambling addiction is a recognised condition, and the whole point of responsible lending laws is that lenders should have identified the signs and protected you. This is about holding THEM accountable, not about judging you.', 'empathetic', 'You are incredibly brave for looking into this. Would you like to tell me a bit about your situation?'),
('data_sharing', ARRAY['data', 'information', 'gdpr', 'privacy policy', 'what do you do with'], 'We take data protection very seriously. Your information is only used to process your claim and is handled in full compliance with GDPR and SRA regulations. We never sell or share your data with third parties. You can request deletion at any time.', 'direct', 'Would you like a link to our full privacy policy?')
ON CONFLICT (objection_type) DO NOTHING;

-- Follow-up sequences
CREATE TABLE IF NOT EXISTS followup_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  trigger_condition VARCHAR(50) NOT NULL CHECK (trigger_condition IN (
    'no_response_24h', 'dropped_off_qualifying', 'dropped_off_converting',
    'started_not_completed', 'viewed_landing_page', 'partial_registration'
  )),
  steps JSONB NOT NULL DEFAULT '[]',
  max_steps INT DEFAULT 5,
  is_active BOOLEAN DEFAULT TRUE,
  total_enrolled INT DEFAULT 0,
  total_converted INT DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Follow-up queue
CREATE TABLE IF NOT EXISTS followup_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES marketing_conversations(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES followup_sequences(id) ON DELETE CASCADE,
  current_step INT DEFAULT 0,
  next_send_at TIMESTAMPTZ,
  next_channel VARCHAR(30) CHECK (next_channel IN ('fb_messenger', 'instagram_dm', 'whatsapp', 'email', 'sms')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'converted', 'unsubscribed', 'max_reached')),
  messages_sent INT DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  lead_responded BOOLEAN DEFAULT FALSE,
  lead_responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation metrics (daily aggregates)
CREATE TABLE IF NOT EXISTS conversation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  channel VARCHAR(30) DEFAULT 'all' CHECK (channel IN ('fb_messenger', 'instagram_dm', 'whatsapp', 'email', 'sms', 'tiktok_dm', 'all')),
  new_conversations INT DEFAULT 0,
  total_messages_in INT DEFAULT 0,
  total_messages_out INT DEFAULT 0,
  bot_handled_fully INT DEFAULT 0,
  bot_to_human_handoffs INT DEFAULT 0,
  bot_qualification_completed INT DEFAULT 0,
  leads_engaged INT DEFAULT 0,
  leads_qualified INT DEFAULT 0,
  leads_sent_to_landing INT DEFAULT 0,
  leads_registered INT DEFAULT 0,
  avg_first_response_seconds INT DEFAULT 0,
  avg_qualification_time_minutes INT DEFAULT 0,
  avg_time_to_registration_minutes INT DEFAULT 0,
  objections_raised INT DEFAULT 0,
  objections_resolved INT DEFAULT 0,
  leads_gone_cold INT DEFAULT 0,
  followups_sent INT DEFAULT 0,
  followups_responded INT DEFAULT 0,
  followup_conversions INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, channel)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conv_status ON marketing_conversations(status);
CREATE INDEX IF NOT EXISTS idx_conv_funnel ON marketing_conversations(funnel_stage);
CREATE INDEX IF NOT EXISTS idx_conv_channel ON marketing_conversations(primary_channel);
CREATE INDEX IF NOT EXISTS idx_conv_channel_user ON marketing_conversations(channel_user_id);
CREATE INDEX IF NOT EXISTS idx_conv_last_msg ON marketing_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_assigned ON marketing_conversations(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conv_followup ON marketing_conversations(next_followup_at) WHERE next_followup_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_msg_conversation ON marketing_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_platform ON marketing_messages(platform_message_id);
CREATE INDEX IF NOT EXISTS idx_qual_conversation ON qualification_answers(conversation_id);
CREATE INDEX IF NOT EXISTS idx_followup_queue_next ON followup_queue(next_send_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_conv_metrics_date ON conversation_metrics(date, channel);
