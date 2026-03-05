# Ad Platform Spec — Communications & AI Chatbot Addendum

**Purpose:** This addendum covers the multi-channel communications layer that sits between lead generation (ads/organic) and client registration. It handles inbound conversations across Facebook Messenger, Instagram DM, WhatsApp, Email, and SMS — using Claude-powered AI to engage leads, qualify them, handle objections, and push them toward registering a claim via the landing page.

Feed this to Claude alongside the three other spec documents.

---

## OVERVIEW: THE CONVERSATION FUNNEL

```
LEAD ARRIVES (from any source)
    │
    ├── Facebook Messenger (clicks "Send Message" on ad or page)
    ├── Instagram DM (messages after seeing content)
    ├── WhatsApp (clicks WhatsApp link on landing page or bio)
    ├── Email (submits form, receives welcome email, replies)
    ├── SMS (submits phone number, receives SMS, replies)
    ├── TikTok DM (messages after seeing content)
    │
    ▼
┌─────────────────────────────────────────────────────┐
│              UNIFIED INBOX (CRM)                     │
│  All channels feed into one conversation view        │
│  Each lead has a single thread regardless of channel │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│           AI CHATBOT (Claude-powered)                │
│                                                      │
│  Stage 1: ENGAGE — Warm greeting, acknowledge their  │
│           situation, build rapport                    │
│                                                      │
│  Stage 2: QUALIFY — Ask key questions:               │
│           • Which lender(s)?                         │
│           • What type of credit?                     │
│           • When was the credit taken out?           │
│           • Were they gambling at the time?          │
│           • Do they still owe money?                 │
│                                                      │
│  Stage 3: EDUCATE — Explain the process, address     │
│           concerns and objections                    │
│                                                      │
│  Stage 4: CONVERT — Push to landing page to          │
│           register the claim                         │
│                                                      │
│  Stage 5: FOLLOW UP — If they don't register,       │
│           automated nurture sequence                  │
└──────────────────────┬──────────────────────────────┘
                       │
              ┌────────┼────────┐
              ▼        ▼        ▼
         REGISTERS   NEEDS     GOES
         A CLAIM     HUMAN     COLD
              │     HANDOFF      │
              ▼        ▼        ▼
          CRM CASE   AGENT    NURTURE
          CREATED   NOTIFIED  SEQUENCE
```

---

## 1. DATABASE TABLES

### 1.1 Communication Channels

```sql
-- Channel connections and configuration
CREATE TABLE comm_channels (
  id UUID PRIMARY KEY,
  channel_type ENUM('fb_messenger', 'instagram_dm', 'whatsapp', 'email', 'sms', 'tiktok_dm'),
  -- Platform credentials
  platform_account_id VARCHAR(100),        -- page ID, WhatsApp business ID, etc
  platform_account_name VARCHAR(255),
  access_token TEXT,
  -- Webhook config
  webhook_url TEXT,
  webhook_verify_token VARCHAR(100),
  webhook_active BOOLEAN DEFAULT FALSE,
  -- Bot config
  bot_enabled BOOLEAN DEFAULT TRUE,        -- is AI chatbot active on this channel?
  bot_greeting TEXT,                        -- initial greeting when someone messages
  bot_operating_hours JSONB,               -- when bot is active (null = 24/7)
  human_fallback_enabled BOOLEAN DEFAULT TRUE,
  -- Rate limits
  messages_per_day_limit INTEGER,          -- platform-specific limits
  messages_sent_today INTEGER DEFAULT 0,
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 1.2 Conversations (Unified Inbox)

```sql
-- One conversation per lead, regardless of channel
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  -- Link to CRM
  lead_id UUID REFERENCES ad_leads(id),
  crm_client_id UUID,                     -- links to your CRM clients table once registered
  -- Contact info
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  -- Channel info
  primary_channel ENUM('fb_messenger', 'instagram_dm', 'whatsapp', 'email', 'sms', 'tiktok_dm'),
  channel_user_id VARCHAR(255),            -- platform-specific user/sender ID
  -- Conversation state
  status ENUM('new', 'bot_active', 'bot_qualifying', 'bot_educating', 
              'bot_converting', 'human_needed', 'human_active', 
              'registered', 'nurture', 'cold', 'closed'),
  funnel_stage ENUM('engaged', 'qualifying', 'qualified', 'educating', 
                     'objection_handling', 'converting', 'registered', 
                     'dropped_off', 'unqualified', 'cold'),
  -- Bot state tracking
  bot_stage INTEGER DEFAULT 1,             -- current stage in qualification flow
  qualification_data JSONB,                -- accumulated answers from qualification
  qualification_score INTEGER DEFAULT 0,   -- 0-100 score based on answers
  -- Objections encountered
  objections_raised JSONB,                 -- array of objection types handled
  -- Source tracking
  source_platform ENUM('facebook_ad', 'instagram_ad', 'tiktok_ad', 'tiktok_organic',
                        'tiktok_spark', 'organic_search', 'direct', 'referral'),
  source_campaign_id UUID REFERENCES campaigns(id),
  source_content_id UUID,                  -- tiktok_content.id or ad.id
  -- Timing
  first_message_at TIMESTAMP,
  last_message_at TIMESTAMP,
  last_bot_message_at TIMESTAMP,
  last_human_message_at TIMESTAMP,
  registered_at TIMESTAMP,
  -- Quality
  response_time_seconds INTEGER,           -- how fast we first replied
  total_messages INTEGER DEFAULT 0,
  bot_messages INTEGER DEFAULT 0,
  human_messages INTEGER DEFAULT 0,
  -- Assignment
  assigned_to VARCHAR(100),                -- human agent if handed off
  handoff_reason TEXT,
  handoff_at TIMESTAMP,
  -- Follow-up
  next_followup_at TIMESTAMP,
  followup_count INTEGER DEFAULT 0,
  max_followups INTEGER DEFAULT 5,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_funnel ON conversations(funnel_stage);
CREATE INDEX idx_conversations_followup ON conversations(next_followup_at) 
  WHERE next_followup_at IS NOT NULL AND status NOT IN ('registered', 'closed', 'cold');
CREATE INDEX idx_conversations_channel ON conversations(primary_channel);
CREATE INDEX idx_conversations_lead ON conversations(lead_id);
```

### 1.3 Messages

```sql
-- Individual messages across all channels
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  -- Message details
  direction ENUM('inbound', 'outbound'),
  sender_type ENUM('lead', 'bot', 'human_agent'),
  channel ENUM('fb_messenger', 'instagram_dm', 'whatsapp', 'email', 'sms', 'tiktok_dm'),
  -- Content
  message_type ENUM('text', 'image', 'video', 'audio', 'document', 'template', 
                     'quick_reply', 'button', 'location', 'contact'),
  message_text TEXT,
  media_url TEXT,
  -- For structured messages (buttons, quick replies)
  buttons JSONB,                           -- [{text, url/payload}]
  quick_replies JSONB,                     -- [{text, payload}]
  -- Platform message ID
  platform_message_id VARCHAR(255),
  -- AI context
  bot_intent_detected VARCHAR(100),        -- what the bot thinks the person is asking
  bot_confidence DECIMAL(4,2),             -- how confident the bot is
  bot_stage_at_send INTEGER,               -- which funnel stage when this was sent
  -- Delivery status
  delivery_status ENUM('sent', 'delivered', 'read', 'failed', 'bounced'),
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  failed_reason TEXT,
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_direction ON messages(direction, created_at);
CREATE INDEX idx_messages_delivery ON messages(delivery_status) WHERE delivery_status = 'failed';
```

### 1.4 Qualification Answers

```sql
-- Structured data collected during qualification
CREATE TABLE qualification_answers (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  question_key VARCHAR(50) NOT NULL,
  answer_text TEXT,
  answer_value VARCHAR(255),               -- normalised value
  confidence ENUM('confirmed', 'inferred', 'unclear'),
  asked_at TIMESTAMP,
  answered_at TIMESTAMP,
  message_id UUID REFERENCES messages(id), -- which message contained the answer
  created_at TIMESTAMP DEFAULT NOW()
);

-- Question keys:
-- 'lender_name'        → which lender(s)
-- 'credit_type'        → credit card, loan, catalogue, overdraft etc
-- 'credit_start_date'  → when was credit taken out (approximate)
-- 'credit_end_date'    → when did it end / is it still active
-- 'gambling_at_time'   → were they gambling when they got the credit
-- 'still_owe_money'    → do they still owe the lender
-- 'amount_borrowed'    → how much was the credit for
-- 'financial_hardship' → were they in financial difficulty at the time
-- 'previous_claim'     → have they claimed before
-- 'full_name'          → their name
-- 'email'              → email address
-- 'phone'              → phone number
-- 'location'           → where they live (UK check)

CREATE INDEX idx_qualification_conversation ON qualification_answers(conversation_id);
```

### 1.5 Objection Library

```sql
-- Pre-loaded objections and approved responses
CREATE TABLE objection_library (
  id UUID PRIMARY KEY,
  objection_type VARCHAR(100) NOT NULL,
  -- Common phrasings people use
  trigger_phrases TEXT[],                  -- array of phrases that indicate this objection
  -- Approved response (SRA compliant)
  response_text TEXT NOT NULL,
  response_tone ENUM('reassuring', 'educational', 'empathetic', 'direct'),
  -- Follow-up
  follow_up_question TEXT,                 -- what to ask after addressing the objection
  -- Effectiveness
  times_used INTEGER DEFAULT 0,
  resolution_rate DECIMAL(5,2),            -- % of times lead continued after this response
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed with common objections:
-- 'cost_concern'          → "How much does this cost?" / "I can't afford a solicitor"
-- 'credit_score_fear'     → "Will this affect my credit score?"
-- 'still_owe_money'       → "I still owe them money, can I still claim?"
-- 'too_good_to_be_true'   → "This sounds like a scam"
-- 'time_concern'          → "How long does it take?"
-- 'previous_rejection'    → "I tried before and was rejected"
-- 'privacy_concern'       → "Will the lender know I'm claiming?"
-- 'not_sure_if_qualifies' → "I don't know if my situation counts"
-- 'want_to_think'         → "I need to think about it"
-- 'partner_approval'      → "I need to speak to my partner first"
-- 'already_paid_off'      → "I already paid off the debt"
-- 'bankruptcy_concern'    → "I went bankrupt, can I still claim?"
-- 'iva_concern'           → "I'm in an IVA, does this affect it?"
-- 'gambling_shame'        → Person is embarrassed about gambling history
-- 'data_sharing'          → "What do you do with my information?"
```

### 1.6 Follow-Up Sequences

```sql
-- Automated follow-up sequences for leads who don't register
CREATE TABLE followup_sequences (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  trigger_condition ENUM('no_response_24h', 'dropped_off_qualifying', 
                          'dropped_off_converting', 'started_not_completed',
                          'viewed_landing_page', 'partial_registration'),
  -- Sequence steps
  steps JSONB,
  -- Structure: [
  --   {
  --     "step": 1,
  --     "delay_hours": 24,
  --     "channel": "same" or "whatsapp" or "sms" or "email",
  --     "message_type": "text" or "template",
  --     "message_text": "...",
  --     "include_link": true,
  --     "tone": "friendly_reminder"
  --   },
  --   { "step": 2, "delay_hours": 72, ... },
  --   { "step": 3, "delay_hours": 168, ... }
  -- ]
  max_steps INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT TRUE,
  -- Performance
  total_enrolled INTEGER DEFAULT 0,
  total_converted INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Individual lead follow-up tracking
CREATE TABLE followup_queue (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  sequence_id UUID REFERENCES followup_sequences(id),
  current_step INTEGER DEFAULT 0,
  -- Scheduling
  next_send_at TIMESTAMP,
  -- Channel for next message
  next_channel ENUM('fb_messenger', 'instagram_dm', 'whatsapp', 'email', 'sms'),
  -- Status
  status ENUM('active', 'paused', 'completed', 'converted', 'unsubscribed', 'max_reached'),
  -- History
  messages_sent INTEGER DEFAULT 0,
  last_sent_at TIMESTAMP,
  lead_responded BOOLEAN DEFAULT FALSE,
  lead_responded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_followup_queue_next ON followup_queue(next_send_at) 
  WHERE status = 'active';
```

### 1.7 Conversation Analytics

```sql
-- Daily conversation performance metrics
CREATE TABLE conversation_metrics (
  id UUID PRIMARY KEY,
  date DATE NOT NULL,
  channel ENUM('fb_messenger', 'instagram_dm', 'whatsapp', 'email', 'sms', 'tiktok_dm', 'all'),
  -- Volume
  new_conversations INTEGER DEFAULT 0,
  total_messages_in INTEGER DEFAULT 0,
  total_messages_out INTEGER DEFAULT 0,
  -- Bot performance
  bot_handled_fully INTEGER DEFAULT 0,     -- bot handled without human needed
  bot_to_human_handoffs INTEGER DEFAULT 0,
  bot_qualification_completed INTEGER DEFAULT 0,
  -- Funnel
  leads_engaged INTEGER DEFAULT 0,
  leads_qualified INTEGER DEFAULT 0,
  leads_sent_to_landing INTEGER DEFAULT 0,
  leads_registered INTEGER DEFAULT 0,
  -- Speed
  avg_first_response_seconds INTEGER,
  avg_qualification_time_minutes INTEGER,
  avg_time_to_registration_minutes INTEGER,
  -- Quality
  objections_raised INTEGER DEFAULT 0,
  objections_resolved INTEGER DEFAULT 0,
  leads_gone_cold INTEGER DEFAULT 0,
  -- Follow-up
  followups_sent INTEGER DEFAULT 0,
  followups_responded INTEGER DEFAULT 0,
  followup_conversions INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(date, channel)
);
```

---

## 2. API ENDPOINTS

### 2.1 Facebook Messenger (via Meta Graph API)

**Base URL:** `https://graph.facebook.com/v21.0`

**Receiving messages (Webhook):**

Set up a webhook subscription for your Facebook Page:
```
POST /{page_id}/subscribed_apps
Fields: messages, messaging_postbacks, messaging_optins, message_reads, message_deliveries
```

Webhook delivers events to your endpoint:
```json
{
  "object": "page",
  "entry": [{
    "messaging": [{
      "sender": {"id": "USER_PSID"},
      "recipient": {"id": "PAGE_ID"},
      "timestamp": 1234567890,
      "message": {
        "mid": "MESSAGE_ID",
        "text": "I saw your ad about irresponsible lending"
      }
    }]
  }]
}
```

**Sending messages:**

| Action | Method | Endpoint | Notes |
|--------|--------|----------|-------|
| Send text | POST | `/{page_id}/messages` | Basic text response |
| Send buttons | POST | `/{page_id}/messages` | With button template |
| Send quick replies | POST | `/{page_id}/messages` | Tap-to-reply options |
| Send generic template | POST | `/{page_id}/messages` | Card with image, title, buttons |
| Mark as seen | POST | `/{page_id}/messages` | Sender action: mark_seen |
| Typing indicator | POST | `/{page_id}/messages` | Sender action: typing_on |

**Text message:**
```json
{
  "recipient": {"id": "USER_PSID"},
  "message": {"text": "Thanks for reaching out. I'd love to help you check if you have a claim."}
}
```

**Quick reply message (great for qualification questions):**
```json
{
  "recipient": {"id": "USER_PSID"},
  "message": {
    "text": "What type of credit did the lender give you?",
    "quick_replies": [
      {"content_type": "text", "title": "Credit Card", "payload": "CREDIT_CARD"},
      {"content_type": "text", "title": "Personal Loan", "payload": "PERSONAL_LOAN"},
      {"content_type": "text", "title": "Catalogue Credit", "payload": "CATALOGUE"},
      {"content_type": "text", "title": "Other", "payload": "OTHER"}
    ]
  }
}
```

**Button message (for pushing to landing page):**
```json
{
  "recipient": {"id": "USER_PSID"},
  "message": {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "button",
        "text": "Based on what you've told me, it sounds like you could have a strong claim. The next step is a quick registration — takes about 3 minutes.",
        "buttons": [
          {
            "type": "web_url",
            "url": "https://your-landing-page.com/register?ref=messenger&lead_id=XXX",
            "title": "Start My Claim",
            "webview_height_ratio": "full"
          },
          {
            "type": "postback",
            "title": "I Have More Questions",
            "payload": "MORE_QUESTIONS"
          }
        ]
      }
    }
  }
}
```

**Messaging window rules (critical):**
- You can reply to a user within **24 hours** of their last message (standard messaging)
- After 24 hours, you can only send messages using **Message Tags** or **Sponsored Messages**
- Allowed message tag for your use case: `CONFIRMED_EVENT_UPDATE` (for claim updates)
- For re-engagement after 24h, use the **One-Time Notification API** — request permission to send a single follow-up
- **Sponsored Messages** (paid) can reach anyone who has previously messaged your page

**One-Time Notification Request:**
```json
{
  "recipient": {"id": "USER_PSID"},
  "message": {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "one_time_notif_req",
        "title": "Can I send you a reminder to complete your claim registration?",
        "payload": "REGISTRATION_REMINDER"
      }
    }
  }
}
```

### 2.2 Instagram DM (via Meta Graph API)

Uses the same Messenger Platform infrastructure. Setup:

```
POST /{ig_user_id}/subscribed_apps
Fields: messages, messaging_postbacks
```

Webhook events arrive in the same format as Messenger but with `"object": "instagram"`.

**Sending messages:**
```json
POST /me/messages

{
  "recipient": {"id": "IGSID"},
  "message": {"text": "Thanks for messaging us..."}
}
```

**Instagram-specific notes:**
- Instagram DM supports text, images, and generic templates
- Quick replies work the same way as Messenger
- Same 24-hour messaging window applies
- No sponsored messages on Instagram — must use One-Time Notification

### 2.3 WhatsApp Business API

**Base URL:** `https://graph.facebook.com/v21.0/{phone_number_id}`

**Receiving messages (Webhook):**

Webhook delivers:
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "447XXXXXXXXX",
          "type": "text",
          "text": {"body": "Hi, I saw your advert about claiming back from lenders"},
          "timestamp": "1234567890"
        }]
      }
    }]
  }]
}
```

**Sending messages:**

| Action | Method | Endpoint |
|--------|--------|----------|
| Send text | POST | `/{phone_id}/messages` |
| Send template | POST | `/{phone_id}/messages` |
| Send interactive (buttons) | POST | `/{phone_id}/messages` |
| Send interactive (list) | POST | `/{phone_id}/messages` |
| Mark as read | POST | `/{phone_id}/messages` |

**Text message:**
```json
{
  "messaging_product": "whatsapp",
  "to": "447XXXXXXXXX",
  "type": "text",
  "text": {"body": "Thanks for getting in touch. I can help you check if you have a claim against your lender."}
}
```

**Interactive button message:**
```json
{
  "messaging_product": "whatsapp",
  "to": "447XXXXXXXXX",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": {
      "text": "Based on what you've told me, it looks like you could have a claim. Ready to get started? It takes about 3 minutes."
    },
    "action": {
      "buttons": [
        {"type": "reply", "reply": {"id": "START_CLAIM", "title": "Start My Claim"}},
        {"type": "reply", "reply": {"id": "MORE_QUESTIONS", "title": "More Questions"}},
        {"type": "reply", "reply": {"id": "CALL_ME", "title": "Call Me Instead"}}
      ]
    }
  }
}
```

**Interactive list message (for qualification — lender selection):**
```json
{
  "messaging_product": "whatsapp",
  "to": "447XXXXXXXXX",
  "type": "interactive",
  "interactive": {
    "type": "list",
    "body": {"text": "Which lender gave you the credit? Select from the list or type the name if it's not shown."},
    "action": {
      "button": "Select Lender",
      "sections": [{
        "title": "Common Lenders",
        "rows": [
          {"id": "vanquis", "title": "Vanquis Bank", "description": "Credit cards"},
          {"id": "loans2go", "title": "Loans 2 Go", "description": "Personal loans"},
          {"id": "118money", "title": "118 118 Money", "description": "Personal loans"},
          {"id": "lending_stream", "title": "Lending Stream", "description": "Short-term loans"},
          {"id": "capital_one", "title": "Capital One", "description": "Credit cards"},
          {"id": "newday", "title": "NewDay", "description": "Store/credit cards"},
          {"id": "cashfloat", "title": "CashFloat", "description": "Short-term loans"},
          {"id": "other", "title": "Other Lender", "description": "Not listed above"}
        ]
      }]
    }
  }
}
```

**WhatsApp messaging window rules:**
- **Customer Service Window**: 24 hours from last customer message — free-form replies allowed
- **After 24 hours**: Must use pre-approved **Message Templates** only
- Templates must be submitted to Meta and approved before use (takes 24-48h)
- Templates can include variables: `"Hello {{1}}, just checking in about your claim against {{2}}."`

**Essential WhatsApp Templates to pre-register:**

| Template Name | Purpose | Example |
|---------------|---------|---------|
| `welcome_new_lead` | First contact when lead enters via ad | "Hi {{1}}, thanks for your interest in checking if you have an irresponsible lending claim. Would you like to find out if you're eligible? Reply YES to get started." |
| `followup_24h` | 24h after no response | "Hi {{1}}, just following up — I can quickly check if you have a claim against {{2}}. It only takes a couple of minutes. Shall we get started?" |
| `followup_72h` | 72h follow-up | "Hi {{1}}, I wanted to let you know that claims against lenders like {{2}} are being settled regularly. If you'd like to check your eligibility, just reply to this message." |
| `registration_reminder` | Started but didn't complete registration | "Hi {{1}}, it looks like you started your claim registration but didn't finish. You can pick up where you left off here: {{2}}" |
| `claim_update` | Claim progress updates | "Hi {{1}}, update on your claim against {{2}}: {{3}}. We'll keep you posted on next steps." |
| `qualification_result` | After qualification questions answered | "Hi {{1}}, based on what you've told me, it looks like you have a strong potential claim against {{2}}. The next step takes about 3 minutes: {{3}}" |

### 2.4 Email

Use your existing email infrastructure (Amazon SES or similar). The bot layer handles:

**Inbound:** Webhook/polling for replies to automated emails
**Outbound:** Triggered emails at each funnel stage

Email templates needed:
- Welcome/first contact
- Qualification questions (if they prefer email)
- "You may have a claim" result email with registration link
- Follow-up sequence (1 day, 3 day, 7 day, 14 day)
- Objection-specific emails (cost concern, credit score fear, etc.)

### 2.5 SMS

Use a provider like Twilio, MessageBird, or Vonage.

**Inbound:** Webhook for incoming SMS replies
**Outbound:** API call to send SMS

SMS messages should be short and direct:
```
Hi {name}, thanks for your interest in checking if you have an irresponsible 
lending claim. Reply YES to find out if you're eligible, or tap here to 
get started: {link}
```

**SMS regulatory notes for UK:**
- Must include opt-out: "Reply STOP to unsubscribe"
- Must identify sender: use "RowanRose" or "FastAction" as sender ID
- PECR compliance: need consent before sending marketing SMS
- Transactional SMS (claim updates) don't need marketing consent

---

## 3. THE AI CHATBOT — CONVERSATION FLOW

### 3.1 How It Works

When a message arrives on any channel:

```
Inbound message
    ↓
Windmill receives webhook
    ↓
Find or create conversation record
    ↓
Load conversation history (all previous messages)
    ↓
Send to Claude API with:
  - System prompt (personality, rules, SRA compliance)
  - Conversation history
  - Current qualification data
  - Current funnel stage
  - Objection library
  - Channel-specific constraints (character limits, button options)
    ↓
Claude generates response
    ↓
Parse response for:
  - Reply text
  - Any structured elements (buttons, quick replies)
  - Updated qualification data
  - Updated funnel stage
  - Whether human handoff needed
  - Whether to send registration link
    ↓
Send response via appropriate channel API
    ↓
Update conversation record
    ↓
If registration link sent → start monitoring for completion
If no response in 24h → enqueue follow-up
```

### 3.2 The System Prompt (Claude API)

```
You are an AI assistant for Rowan Rose Solicitors (trading as Fast Action Claims), 
a UK law firm specialising in irresponsible lending compensation claims. You are 
having a conversation with a potential client via {channel_name}.

YOUR ROLE:
- You are helpful, empathetic, and knowledgeable about irresponsible lending claims
- You work for the firm and represent them professionally
- You are NOT a solicitor — you are an intake assistant helping people check eligibility
- You guide people through initial qualification and toward registering their claim

PERSONALITY:
- Warm but professional
- Empathetic — these people may have been through real financial hardship
- Patient — some people need time and multiple questions answered
- Never pushy or aggressive — this is a trusted solicitor's practice
- Use simple language, no legal jargon unless explaining something
- Conversational tone — like a helpful person at a reception desk
- If someone mentions gambling, be sensitive — no judgement whatsoever
- If someone seems distressed, acknowledge their feelings before moving to business

QUALIFICATION FLOW:
You need to gather the following information, but do it conversationally — don't 
fire questions like a form. Weave them into natural conversation.

Required information:
1. Which lender(s) — "Which lender or lenders are you thinking about?"
2. Type of credit — "Was this a credit card, loan, or something else?"
3. Approximate dates — "Roughly when did you take out the credit?"
4. Gambling connection — "Were you gambling around that time?" (ask sensitively)
5. Current status — "Do you still owe them money, or is it paid off?"
6. Name — "Can I take your name?"
7. Contact details — email and/or phone if not already known from the channel

NOT required but helpful:
- How much was the credit for
- Whether they were in financial difficulty at the time
- Whether they've tried claiming before

IMPORTANT RULES:
- NEVER guarantee an outcome. Say "could", "may", "potential" — never "will" or "definitely"
- NEVER provide specific legal advice — you are facilitating intake, not advising
- NEVER mention specific compensation amounts as guarantees
- You CAN mention anonymised examples: "We've helped clients in similar situations"
- You CAN explain the general process and timeline
- If someone asks a complex legal question, say you'll have one of the solicitors 
  review it and get back to them
- Always be transparent that this is a claims management service and fees apply
- If asked about fees, explain: "If your claim is successful, our fee is a percentage 
  of what you receive. There's nothing to pay upfront and no cost if the claim 
  is unsuccessful."
- NEVER fabricate information about the firm, its track record, or outcomes
- SRA COMPLIANCE: All communications must comply with SRA Standards and Regulations

WHEN TO PUSH TO REGISTRATION:
Once you have answers to questions 1-5 above AND the person seems eligible 
(they had credit from a recognisable lender, especially during a period of 
financial difficulty or gambling), guide them to register:

"Based on what you've told me, it sounds like you could have a strong claim. 
The next step is a quick registration — it takes about 3 minutes and there's 
no obligation. Shall I send you the link?"

WHEN TO HAND OFF TO A HUMAN:
- If the person asks a complex legal question you can't answer
- If the person seems very distressed or mentions self-harm
- If the person is angry or aggressive and the bot can't de-escalate
- If the person specifically asks to speak to a solicitor or human
- If you've gone back and forth more than 10 messages without progress
- If the person's situation is unusual and doesn't fit standard criteria

HANDLING OBJECTIONS:
{Insert relevant objections from objection_library here}

CHANNEL CONSTRAINTS:
{channel_type}: {specific constraints — e.g. WhatsApp max 4096 chars, 
SMS max 160 chars, Messenger supports quick replies and buttons}

CURRENT CONVERSATION STATE:
- Funnel stage: {current_stage}
- Qualification data so far: {JSON of answers collected}
- Objections raised: {list}
- Messages exchanged: {count}
- Channel: {channel_type}

RESPONSE FORMAT:
Respond with JSON:
{
  "reply_text": "Your message to the lead",
  "include_buttons": true/false,
  "buttons": [{"text": "Button text", "payload": "ACTION"}],
  "include_quick_replies": true/false,
  "quick_replies": [{"text": "Option", "payload": "ACTION"}],
  "updated_stage": "qualifying" / "educating" / "converting" / etc,
  "qualification_updates": {"lender_name": "Vanquis", "credit_type": "credit_card"},
  "needs_human": false,
  "human_reason": null,
  "send_registration_link": false,
  "detected_objection": null,
  "sentiment": "positive" / "neutral" / "concerned" / "skeptical" / "distressed",
  "notes": "Any internal notes for the CRM"
}
```

### 3.3 Stage-Specific Behaviour

**Stage 1: ENGAGE (first 1-2 messages)**
- Warm greeting
- Acknowledge how they found you (ad, TikTok, referral)
- Open-ended question to get them talking
- Example: "Thanks for reaching out! I can help you check if you might have a claim against a lender. What's prompted you to look into this?"

**Stage 2: QUALIFY (3-6 messages)**
- Work through qualification questions conversationally
- Adapt order based on what they volunteer
- If they say "I had a Vanquis card while I was gambling" — that's lender AND gambling answered in one go
- Use quick replies / buttons where available for structured answers
- Example: "Vanquis is one of the lenders we deal with regularly. Was this a credit card? And roughly when did you have it — are we talking last few years or further back?"

**Stage 3: EDUCATE (if needed, 2-4 messages)**
- Explain the process simply
- Address any concerns they raise
- Build confidence that claiming is legitimate and straightforward
- Example: "The process is quite straightforward. We review your situation, submit a complaint to the lender, and if they reject it or don't respond fairly, we can escalate to the Financial Ombudsman. Most claims are resolved within a few months."

**Stage 4: CONVERT (1-2 messages)**
- Summarise what they've told you
- Confirm it sounds like they could have a claim
- Send the registration link
- Make it feel easy and low-commitment
- Example: "So to summarise — you had a Vanquis credit card from around 2019, you were gambling at the time, and they kept increasing your limit. That's exactly the type of case we handle. The next step is a quick registration — takes about 3 minutes. Here's the link: [LINK]. No obligation at all."

**Stage 5: FOLLOW UP (if they don't register)**
- Automated sequence kicks in
- Gentle, not pushy
- Address the most common reason people drop off at this stage
- Provide additional social proof or information

### 3.4 Objection Handling Examples

These should be pre-loaded into the `objection_library` table:

**"How much does it cost?"**
> "There's nothing to pay upfront. If your claim is successful, our fee is a percentage of what you receive — and if the claim isn't successful, you don't pay anything. So there's genuinely no financial risk to you."

**"Will this affect my credit score?"**
> "Making a claim doesn't affect your credit score. The claim is about the lender's behaviour, not yours. Your credit file stays exactly as it is."

**"I still owe them money — can I still claim?"**
> "Yes, absolutely. In fact, if you're still repaying, a successful claim could reduce or even clear what you owe. Many of our clients are in exactly this position."

**"This sounds too good to be true"**
> "I completely understand the scepticism. This is a legitimate legal process regulated by the Financial Conduct Authority. Lenders are required to assess whether you can afford the credit before giving it to you — if they didn't do that properly, they have to put things right. We're regulated by the Solicitors Regulation Authority, so everything we do is fully above board."

**"How long does it take?"**
> "It varies depending on the lender, but most claims are resolved within 3 to 8 months. Some are quicker, especially with lenders who are processing claims efficiently at the moment. We keep you updated throughout."

**"I'm not sure if my situation counts"**
> "That's exactly what the initial check is for — there's no commitment and it only takes a couple of minutes. Even if you're unsure, it's worth checking. We can quickly tell you whether there's a potential claim."

**Person seems ashamed about gambling:**
> "I just want you to know there's absolutely no judgement here. Gambling problems affect millions of people, and the issue isn't about you — it's about lenders who should have noticed the signs and acted responsibly. You're doing the right thing by looking into this."

---

## 4. WINDMILL JOBS

### 4.1 Webhook Receiver / Message Router

```
Name: message_router
Trigger: Webhook (real-time, not scheduled)
Language: TypeScript

This is the core job that handles ALL inbound messages.

Steps:
1. Receive webhook payload from any channel
2. Identify channel type from webhook structure
3. Extract: sender ID, message text, message type, any attachments
4. Find existing conversation by channel + sender ID
   - If none exists: CREATE new conversation, INSERT first message
5. INSERT inbound message into messages table
6. Send typing indicator / read receipt to the channel
7. Load conversation context:
   - Full message history (last 20 messages)
   - Qualification data collected so far
   - Current funnel stage
   - Any relevant objections from library
8. Build Claude API request with system prompt + context
9. Call Claude API (claude-sonnet-4-5-20250929 for speed, or claude-opus-4-6 for complex)
10. Parse Claude's JSON response
11. Format response for the specific channel:
    - Messenger: add quick_replies or buttons if specified
    - WhatsApp: format as interactive message if buttons present
    - SMS: strip to plain text, keep under 160 chars, add opt-out
    - Email: add proper formatting, signature, branding
12. Send response via channel API
13. INSERT outbound message into messages table
14. UPDATE conversation:
    - status, funnel_stage, qualification_data, last_message_at
15. If send_registration_link = true:
    - Generate unique tracked link with lead_id parameter
    - Update funnel_stage to 'converting'
16. If needs_human = true:
    - Set status to 'human_needed'
    - Send notification to Brad / team
    - Respond to lead: "Let me get one of the team to help you with that. 
      Someone will be in touch shortly."
17. If sentiment = 'distressed':
    - Flag in CRM for priority human review
    - Bot should have already responded with empathy and support
    - Do NOT use end_conversation or disengage
18. Log all actions for audit trail
```

### 4.2 Follow-Up Sequence Runner

```
Name: followup_runner
Schedule: Every 15 minutes
Language: TypeScript

Steps:
1. Query followup_queue WHERE:
   - status = 'active'
   - next_send_at <= NOW()
2. For each queued follow-up:
   a. Load the conversation and sequence step
   b. Check: has the lead responded since last follow-up?
      - If YES: pause sequence, bot will handle from message_router
   c. Check: has the lead registered?
      - If YES: mark sequence as 'converted', stop
   d. Check: has max_followups been reached?
      - If YES: mark as 'max_reached', set conversation to 'cold'
   e. Determine channel for this step:
      - If "same": use conversation.primary_channel
      - If specific channel: use that
      - Check 24h window for Messenger/IG/WhatsApp — if expired, 
        use template or switch to SMS/email
   f. Build follow-up message:
      - If template-based: use pre-approved template with variables
      - If free-form (within window): personalise using Claude:
        "Generate a follow-up message for {name} who was interested in 
         claiming against {lender} but hasn't registered yet. 
         This is follow-up #{step}. Previous context: {summary}. 
         Tone: {friendly_reminder/value_add/urgency}. 
         Channel: {channel} (max {char_limit} characters)."
   g. Send message via appropriate channel API
   h. INSERT into messages table
   i. UPDATE followup_queue: increment step, set next_send_at
   j. Log result
```

### 4.3 Follow-Up Enroller

```
Name: followup_enroller
Schedule: Every hour
Language: TypeScript

Steps:
1. Find conversations that need follow-up:
   
   NO RESPONSE 24H:
   - status = 'bot_active' or 'bot_qualifying'
   - last_message_at < NOW() - 24 hours
   - NOT already in followup_queue
   → Enroll in 'no_response_24h' sequence
   
   DROPPED OFF DURING QUALIFYING:
   - funnel_stage = 'qualifying'
   - last_message_at < NOW() - 4 hours
   - lead sent at least 2 messages (showed initial interest)
   → Enroll in 'dropped_off_qualifying' sequence
   
   SENT LINK BUT DIDN'T REGISTER:
   - funnel_stage = 'converting'
   - registration link sent
   - NOT registered within 2 hours
   → Enroll in 'started_not_completed' sequence

2. For each, INSERT into followup_queue with:
   - First step scheduled based on sequence delay
   - Channel set based on sequence config
```

### 4.4 Registration Monitor

```
Name: registration_monitor
Schedule: Every 5 minutes
Language: TypeScript

Steps:
1. Query conversations WHERE funnel_stage = 'converting' AND registered_at IS NULL
2. For each, check landing page / CRM for new registrations:
   - Match by email, phone, or tracking link parameter
3. If registration found:
   a. UPDATE conversation: status = 'registered', registered_at = NOW()
   b. UPDATE followup_queue: status = 'converted'
   c. Link conversation to CRM client record
   d. Send confirmation message on their channel:
      "Your claim has been registered. One of our team will review 
       everything and be in touch within 24 hours. In the meantime, 
       if you have any questions, just message me here."
   e. UPDATE blended_performance with lead source attribution
```

### 4.5 Conversation Analytics Aggregator

```
Name: conversation_analytics
Schedule: Daily at 23:30
Language: TypeScript

Steps:
1. Aggregate daily conversation metrics per channel and overall
2. INSERT into conversation_metrics table
3. Send to Claude for analysis:
   "Here are today's conversation metrics:
    
    New conversations: {count} (by channel breakdown)
    Bot fully handled: {count} ({pct}%)
    Human handoffs: {count} ({pct}%)
    Qualifications completed: {count}
    Registration links sent: {count}
    Registrations completed: {count}
    
    Avg first response time: {seconds}
    Avg time to registration: {minutes}
    
    Most common objections: {list with counts}
    
    Follow-ups sent: {count}
    Follow-up conversions: {count}
    
    Conversations gone cold: {count}
    
    Please analyse:
    1. Bot effectiveness — is it qualifying and converting well?
    2. Where in the funnel are we losing people?
    3. Which objections are hardest to overcome?
    4. Which channel converts best?
    5. Are follow-up sequences working?
    6. Specific recommendations to improve conversion rate
    7. Any patterns in the conversations that suggest content/ad changes"
```

### 4.6 Human Handoff Notifier

```
Name: human_handoff_notifier
Trigger: Real-time (called by message_router when needs_human = true)
Language: TypeScript

Steps:
1. Receive conversation_id and handoff_reason
2. Load conversation summary:
   - Lead name, channel, source
   - Qualification data collected
   - Summary of conversation
   - Why handoff was triggered
3. Send notification to Brad via:
   - WhatsApp: "🔔 Human needed: {name} on {channel}. 
     Reason: {reason}. Qualification so far: {summary}. 
     Reply in CRM: {link}"
   - Email: Same info with full conversation history
   - CRM dashboard: Add to "Needs Attention" queue
4. Set conversation.assigned_to and handoff_at
5. Start timer: if no human response in 30 minutes, 
   send another notification
```

---

## 5. DASHBOARD PAGES

### 5.1 Unified Inbox Page

**Live Conversation Feed (left panel):**
- List of all active conversations, sorted by last message
- Each shows: name, channel icon, last message preview, funnel stage badge, time since last message
- Colour coding: 
  - 🟢 Bot handling (no action needed)
  - 🟡 Awaiting lead response
  - 🔴 Human needed
  - 🔵 In follow-up sequence
- Filter by: channel, status, funnel stage

**Conversation Detail (right panel — clicking a conversation):**
- Full message thread with timestamps
- Channel icon on each message
- Bot messages labelled as "Bot"
- Qualification data sidebar showing what's been collected
- Funnel stage progress bar
- Action buttons:
  - "Take Over" (switch from bot to manual)
  - "Send Registration Link"
  - "Add to Follow-Up"
  - "Mark as Cold"
  - "Transfer to Solicitor"
- Quick reply templates for human agents

### 5.2 Bot Performance Dashboard

**Top KPI Cards:**
- Bot Resolution Rate (% handled without human)
- Average Qualification Time
- Conversation → Registration Rate
- Average First Response Time

**Funnel Visualisation:**
```
New Conversations    →  Engaged  →  Qualifying  →  Qualified  →  Link Sent  →  Registered
      200                 180         140            95            80            52
                         (90%)       (78%)         (68%)         (84%)         (65%)
```

**Drop-off Analysis:**
- Chart showing where in the funnel leads drop off
- Most common last message before dropping off
- Most common objection that wasn't resolved

**Channel Comparison:**
| Channel | Conversations | Qualified | Registered | Conv Rate | Avg Time to Register |
|---------|--------------|-----------|-----------|-----------|---------------------|
| FB Messenger | 80 | 42 | 24 | 30% | 18 min |
| WhatsApp | 55 | 35 | 22 | 40% | 12 min |
| Instagram DM | 40 | 18 | 8 | 20% | 25 min |
| SMS | 15 | 8 | 5 | 33% | 8 min |
| TikTok DM | 10 | 5 | 3 | 30% | 22 min |

**Objection Heatmap:**
- Which objections appear most frequently
- Resolution rate per objection type
- Average messages needed to resolve each objection

### 5.3 Follow-Up Performance Page

**Active Sequences:**
| Sequence | Enrolled | Step 1 Sent | Responded | Registered | Conv Rate |
|----------|---------|-------------|-----------|-----------|-----------|
| No Response 24h | 45 | 45 | 18 (40%) | 8 (18%) | 18% |
| Dropped Qualifying | 22 | 22 | 12 (55%) | 6 (27%) | 27% |
| Sent Link No Register | 30 | 30 | 15 (50%) | 10 (33%) | 33% |

**Step-by-Step Analysis:**
- Which follow-up step converts the most
- Which channel works best for follow-ups
- Optimal timing between follow-ups

**Cold Lead Recovery:**
- Leads marked as cold that could be re-engaged
- AI suggestion: "These 12 cold leads mentioned {lender} — there's been a recent FOS ruling in favour of claimants against that lender. Consider a targeted re-engagement message."

### 5.4 Conversation Intelligence Page

**What People Ask Most:**
- Word cloud or ranked list of most common questions / topics
- Grouped by: eligibility, process, cost, timeline, trust/legitimacy

**Lender Mentions:**
- Which lenders are mentioned most in conversations
- Conversion rate by lender (some lenders may be easier claims)

**Sentiment Over Time:**
- Chart showing conversation sentiment trends
- Dips might indicate ad messaging problems

**Content Suggestions (AI-generated):**
- "Based on conversation data, 32% of leads ask about credit score impact. 
  Consider creating a TikTok addressing this directly."
- "Leads mentioning Vanquis convert at 45% vs 28% for other lenders. 
  Consider more Vanquis-specific ad content."
- "The objection 'sounds too good to be true' appears in 25% of conversations. 
  Consider adding social proof / SRA credentials earlier in the bot flow."

---

## 6. INTEGRATION WITH EXISTING SPEC

### 6.1 Updates to ad_leads Table

```sql
-- Add conversation tracking to existing leads table
ALTER TABLE ad_leads ADD COLUMN conversation_id UUID REFERENCES conversations(id);
ALTER TABLE ad_leads ADD COLUMN source_channel ENUM(
  'fb_messenger', 'instagram_dm', 'whatsapp', 'email', 'sms', 'tiktok_dm',
  'lead_form_meta', 'lead_form_tiktok', 'landing_page_direct'
);
ALTER TABLE ad_leads ADD COLUMN bot_qualified BOOLEAN DEFAULT FALSE;
ALTER TABLE ad_leads ADD COLUMN qualification_score INTEGER;
ALTER TABLE ad_leads ADD COLUMN time_to_qualify_minutes INTEGER;
ALTER TABLE ad_leads ADD COLUMN time_to_register_minutes INTEGER;
```

### 6.2 Updates to Blended Performance

Add to the `blended_performance` table:

```sql
ALTER TABLE blended_performance ADD COLUMN messenger_leads INTEGER DEFAULT 0;
ALTER TABLE blended_performance ADD COLUMN whatsapp_leads INTEGER DEFAULT 0;
ALTER TABLE blended_performance ADD COLUMN instagram_dm_leads INTEGER DEFAULT 0;
ALTER TABLE blended_performance ADD COLUMN sms_leads INTEGER DEFAULT 0;
ALTER TABLE blended_performance ADD COLUMN email_leads INTEGER DEFAULT 0;
ALTER TABLE blended_performance ADD COLUMN tiktok_dm_leads INTEGER DEFAULT 0;
ALTER TABLE blended_performance ADD COLUMN bot_qualified_total INTEGER DEFAULT 0;
ALTER TABLE blended_performance ADD COLUMN human_qualified_total INTEGER DEFAULT 0;
ALTER TABLE blended_performance ADD COLUMN avg_time_to_register_minutes INTEGER;
ALTER TABLE blended_performance ADD COLUMN followup_conversions INTEGER DEFAULT 0;
```

### 6.3 Updates to Overview Dashboard

Add to the main overview dashboard KPI cards:

- **Active Conversations** — currently in-progress chats
- **Bot Resolution Rate** — % handled without human
- **Avg Response Time** — how fast leads get a first reply
- **Conversations → Registered Today** — today's conversion count
- **Human Handoffs Pending** — needs attention count (red if > 0)

### 6.4 Updates to AI Command Centre

Add suggested prompts:

- "How is the chatbot performing this week? Where are we losing leads?"
- "Which objection handling responses need improving?"
- "Write a new follow-up sequence for leads who mentioned {lender}"
- "Analyse conversation sentiment — are our ads attracting the right leads?"
- "What questions are leads asking that the bot can't answer?"
- "Generate a WhatsApp template for re-engaging cold leads"

---

## 7. UPDATED IMPLEMENTATION PHASES

Add these phases:

### Phase 8 — Communications Infrastructure (Week 15-16)
- [ ] Unified inbox database tables
- [ ] Facebook Messenger webhook and API integration
- [ ] Instagram DM webhook and API integration
- [ ] WhatsApp Business API setup and template approval
- [ ] SMS provider integration (Twilio or similar)
- [ ] Email inbound/outbound integration
- [ ] Message router Windmill job
- [ ] Unified inbox dashboard page

### Phase 9 — AI Chatbot (Week 17-18)
- [ ] Claude API integration for conversation handling
- [ ] System prompt engineering and testing
- [ ] Qualification flow implementation (5 stages)
- [ ] Objection library setup with pre-approved responses
- [ ] Channel-specific message formatting (buttons, quick replies, lists)
- [ ] Bot performance dashboard
- [ ] Human handoff system and notifications
- [ ] Conversation intelligence page

### Phase 10 — Follow-Up Automation (Week 19-20)
- [ ] Follow-up sequence definitions
- [ ] WhatsApp message template approval
- [ ] Follow-up runner Windmill job
- [ ] Follow-up enroller Windmill job
- [ ] Registration monitor
- [ ] Follow-up performance dashboard
- [ ] Re-engagement campaigns for cold leads
- [ ] Integration with blended CPL tracking
