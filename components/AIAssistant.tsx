
import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Sparkles, Loader2, ChevronRight, FileText, BarChart2, Calendar, CheckCircle } from 'lucide-react';
import { ChatMessage } from '../types';
import { useCRM } from '../context/CRMContext';
import { API_ENDPOINTS } from '../src/config';

interface AIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

const API_BASE = API_ENDPOINTS.base;

const AIAssistant: React.FC<AIAssistantProps> = ({ isOpen, onClose }) => {
  const {
    updateContactStatus,
    updateContact,
    addContact,
    addClaim,
    updateClaim,
    getPipelineStats,
    addTemplate,
    addDocument,
    claims,
    contacts,
    appointments,
    activeContext,
    bulkUpdateClaims,
    addAppointment
  } = useCRM();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: "I am FastAction AI, your intelligent Legal Operations Manager with full CRM access.\n\nI can help you with:\n• Managing contacts and claims through the 48-stage pipeline\n• Analyzing bank statements and DSARs for affordability breaches\n• Calculating qualification scores (DTI, disposable income)\n• Drafting complaint letters citing FCA CONC regulations\n• Generating FOS submission summaries\n• Sending communications and triggering workflows\n• Generating reports and analytics\n\nWhat would you like me to help you with?",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string>(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Execute tool calls and return results
  const executeToolCall = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    console.log("AI calling tool:", name, args);

    try {
      // ═══════════════════════════════════════════════════════════════════════════
      //                          CRM DATA OPERATIONS
      // ═══════════════════════════════════════════════════════════════════════════

      if (name === 'searchCRM') {
        const { query, entityType, filters } = args as { query: string; entityType?: string; filters?: any };
        const qLower = query.toLowerCase();

        let foundContacts: any[] = [];
        let foundClaims: any[] = [];

        if (entityType === 'contact' || entityType === 'all' || !entityType) {
          foundContacts = contacts.filter(c => {
            const matches = c.fullName.toLowerCase().includes(qLower) ||
              c.email?.toLowerCase().includes(qLower) ||
              c.phone?.includes(query) ||
              c.id === query;

            // Apply filters if provided
            if (filters?.status && c.status !== filters.status) return false;
            if (filters?.lender && c.lender !== filters.lender) return false;

            return matches;
          });
        }

        if (entityType === 'claim' || entityType === 'all' || !entityType) {
          foundClaims = claims.filter(c => {
            const matches = c.id === query ||
              c.lender?.toLowerCase().includes(qLower) ||
              c.accountNumber?.includes(query);

            // Apply filters if provided
            if (filters?.status && c.status !== filters.status) return false;
            if (filters?.lender && c.lender !== filters.lender) return false;

            return matches;
          });
        }

        // Enrich claims with contact names
        const enrichedClaims = foundClaims.map(c => {
          const contact = contacts.find(con => con.id === c.contactId);
          return { ...c, contactName: contact?.fullName };
        });

        return {
          contacts: foundContacts.map(c => ({
            id: c.id,
            name: c.fullName,
            email: c.email,
            phone: c.phone,
            status: c.status,
            lender: c.lender
          })),
          claims: enrichedClaims,
          totalFound: foundContacts.length + foundClaims.length
        };
      }

      else if (name === 'createContact') {
        const { firstName, lastName, fullName, phone, email, dateOfBirth, address, source } = args as any;

        console.log('[AI Create Contact] Raw args:', { firstName, lastName, fullName, phone, email, dateOfBirth, address, source });

        // Parse address if it's a string
        let addressObj = address;
        if (typeof address === 'string') {
          // Try to parse address string like "14 Windsor Gardens, London, W9 3RA, United Kingdom"
          const parts = address.split(',').map((p: string) => p.trim());
          addressObj = {
            line1: parts[0] || '',
            city: parts[1] || '',
            postalCode: parts[2] || '',
            state_county: parts[3] || 'United Kingdom'
          };
          console.log('[AI Create Contact] Parsed address string to object:', addressObj);
        } else if (address && typeof address === 'object') {
          // Ensure consistent field naming - AI might send 'county' instead of 'state_county'
          addressObj = {
            line1: address.line1 || '',
            line2: address.line2 || '',
            city: address.city || '',
            postalCode: address.postalCode || '',
            state_county: address.state_county || address.county || ''
          };
          console.log('[AI Create Contact] Normalized address object:', addressObj);
        }

        // Convert DD/MM/YYYY to YYYY-MM-DD for database
        let formattedDob = dateOfBirth;
        if (dateOfBirth && dateOfBirth.includes('/')) {
          const [day, month, year] = dateOfBirth.split('/');
          formattedDob = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          console.log('[AI Create Contact] Converted DOB from', dateOfBirth, 'to', formattedDob);
        }

        const contactData = {
          firstName: firstName || fullName?.split(' ')[0],
          lastName: lastName || fullName?.split(' ').slice(1).join(' '),
          fullName: fullName || `${firstName} ${lastName}`,
          phone,
          email,
          dateOfBirth: formattedDob,
          address: addressObj,
          source: source || 'AI Import'
        };

        console.log('[AI Create Contact] Final contactData being sent to addContact:', contactData);

        return addContact(contactData);
      }

      else if (name === 'updateContact') {
        const { contactId, updates } = args as { contactId: string; updates: any };
        const existing = contacts.find(c => c.id === contactId);
        if (!existing) return { success: false, message: `Contact with ID ${contactId} not found` };

        // Handle date format conversion for DOB
        let formattedUpdates = { ...updates };
        if (updates.dateOfBirth && updates.dateOfBirth.includes('/')) {
          const [day, month, year] = updates.dateOfBirth.split('/');
          formattedUpdates.dateOfBirth = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }

        // Handle address parsing if string
        if (typeof updates.address === 'string') {
          const parts = updates.address.split(',').map((p: string) => p.trim());
          formattedUpdates.address = {
            line1: parts[0] || existing.address?.line1 || '',
            city: parts[1] || existing.address?.city || '',
            postalCode: parts[2] || existing.address?.postalCode || '',
            state_county: parts[3] || existing.address?.state_county || ''
          };
        } else if (updates.address) {
          formattedUpdates.address = { ...existing.address, ...updates.address };
        }

        // Merge updates with existing contact
        const updatedContact = {
          ...existing,
          ...formattedUpdates,
          fullName: formattedUpdates.firstName && formattedUpdates.lastName
            ? `${formattedUpdates.firstName} ${formattedUpdates.lastName}`
            : formattedUpdates.fullName || existing.fullName
        };

        return await updateContact(updatedContact);
      }

      else if (name === 'manageClaim') {
        const { action, contactId, claimId, ...data } = args as any;
        if (action === 'create') {
          return addClaim({ contactId, ...data });
        } else if (action === 'update') {
          const existing = claims.find(c => c.id === claimId);
          if (!existing) return { success: false, message: 'Claim not found' };
          return updateClaim({ ...existing, ...data });
        }
        return { success: false, message: 'Invalid action' };
      }

      else if (name === 'updateClaimStatus') {
        const { claimId, newStatus, notes } = args as { claimId: string; newStatus: string; notes?: string };
        console.log('Updating claim status:', claimId, 'to', newStatus, notes ? `(${notes})` : '');
        return updateContactStatus(claimId, newStatus);
      }

      else if (name === 'bulkClaimOperation') {
        const { lender, currentStatus, phase, minDaysInStage, action, newValue } = args as any;
        if (action === 'updateStatus') {
          return bulkUpdateClaims({
            lender,
            status: currentStatus,
            minDaysInStage
          }, newValue);
        }
        return { success: false, message: 'Unsupported bulk action' };
      }

      else if (name === 'getPipelineStats') {
        const { breakdown } = args as { breakdown?: string };
        const stats = getPipelineStats();

        // Enhanced stats with phase breakdown
        const phaseBreakdown = {
          'Lead Generation': claims.filter(c => ['New Lead', 'Contact Attempted', 'In Conversation', 'Qualification Call', 'Qualified Lead', 'Not Qualified'].includes(c.status)).length,
          'Onboarding': claims.filter(c => c.status.includes('Onboarding') || c.status.includes('LOA') || c.status.includes('Bank Statements') || c.status.includes('ID ') || c.status.includes('Questionnaire')).length,
          'DSAR': claims.filter(c => c.status.includes('DSAR') || c.status === 'Data Analysis').length,
          'Complaint': claims.filter(c => c.status.includes('Complaint') || c.status.includes('Response') || c.status === 'Client Review').length,
          'FOS': claims.filter(c => c.status.includes('FOS')).length,
          'Payments': claims.filter(c => c.status.includes('Offer') || c.status.includes('Payment') || c.status.includes('Fee') || c.status.includes('Client Paid') || c.status.includes('Claim ')).length
        };

        return {
          ...stats,
          totalClaims: claims.length,
          totalContacts: contacts.length,
          phaseBreakdown,
          breakdown
        };
      }

      // ═══════════════════════════════════════════════════════════════════════════
      //                          DOCUMENT ANALYSIS
      // ═══════════════════════════════════════════════════════════════════════════

      else if (name === 'analyzeDSAR') {
        const { textData, contactId, extractFields } = args as { textData: string; contactId?: string; extractFields?: string[] };

        // Extract key information from DSAR text
        const loanAmountMatch = textData.match(/(?:loan|credit|amount|principal)[:\s]*£?([\d,]+(?:\.\d{2})?)/i);
        const aprMatch = textData.match(/(?:APR|annual percentage rate)[:\s]*([\d.]+)%?/i);
        const dateMatch = textData.match(/(?:date|agreement date|loan date)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);

        return {
          success: true,
          contactId,
          extractedData: {
            loanAmount: loanAmountMatch ? parseFloat(loanAmountMatch[1].replace(',', '')) : null,
            apr: aprMatch ? parseFloat(aprMatch[1]) : null,
            loanDate: dateMatch ? dateMatch[1] : null,
            rawTextLength: textData.length
          },
          potentialBreaches: textData.toLowerCase().includes('afford') ? ['CONC 5.2A.4R - Affordability not properly assessed'] : [],
          recommendation: 'Manual review recommended to verify extracted data'
        };
      }

      else if (name === 'analyzeBankStatement') {
        const { textData, contactId, loanDate, analysisType } = args as any;
        const textLower = textData.toLowerCase();

        // Gambling detection
        const gamblingKeywords = ['bet365', 'paddy power', 'william hill', 'betfair', 'sky bet', 'coral', 'ladbrokes', 'casino', 'gambling', 'betway', 'pokerstars'];
        const gamblingDetected = gamblingKeywords.some(kw => textLower.includes(kw));

        // Income pattern detection
        const salaryMatch = textData.match(/(?:salary|wages|income|pay)[:\s]*£?([\d,]+(?:\.\d{2})?)/gi);

        // Basic expense categories
        const hasRentMortgage = textLower.includes('rent') || textLower.includes('mortgage');
        const hasUtilities = textLower.includes('gas') || textLower.includes('electric') || textLower.includes('water');

        return {
          success: true,
          contactId,
          analysisType,
          loanDate,
          findings: {
            gamblingDetected,
            gamblingIndicators: gamblingKeywords.filter(kw => textLower.includes(kw)),
            incomePatternDetected: salaryMatch ? salaryMatch.length : 0,
            essentialExpenses: { rent: hasRentMortgage, utilities: hasUtilities },
            redFlags: gamblingDetected ? ['Gambling transactions detected during loan period'] : []
          },
          qualificationImpact: gamblingDetected ? '+25 points (gambling evidence)' : 'No gambling markers found'
        };
      }

      else if (name === 'calculateAffordability') {
        const { contactId, income, expenses, loanAmount, monthlyRepayment, evidenceFactors } = args as any;

        const totalExpenses = Object.values(expenses || {}).reduce((sum: number, val) => sum + (Number(val) || 0), 0 as number);
        const disposableIncome = (income?.netMonthly || 0) - totalExpenses;
        const dtiRatio = income?.grossMonthly ? ((expenses?.debtPayments || 0) / income.grossMonthly) * 100 : 0;

        // Calculate qualification score (0-100)
        let score = 0;
        if (evidenceFactors?.gamblingDetected) score += 25;
        if (dtiRatio > 40) score += 20;
        if (evidenceFactors?.multipleLoansInPeriod) score += 15;
        if (evidenceFactors?.existingArrears) score += 15;
        if (evidenceFactors?.incomeNotVerified) score += 10;
        if (evidenceFactors?.repeatBorrower) score += 10;
        if (disposableIncome < (monthlyRepayment || 0)) score += 5;

        const scoreInterpretation = score >= 70 ? 'Strong case - proceed to complaint' :
          score >= 50 ? 'Moderate case - gather additional evidence' :
            score >= 30 ? 'Weak case - requires review' : 'Case unlikely to succeed';

        return {
          success: true,
          contactId,
          affordabilityMetrics: {
            netMonthlyIncome: income?.netMonthly || 0,
            totalMonthlyExpenses: totalExpenses,
            disposableIncome,
            dtiRatio: Math.round(dtiRatio * 100) / 100,
            loanAffordable: disposableIncome >= (monthlyRepayment || 0)
          },
          qualificationScore: Math.min(score, 100),
          scoreBreakdown: evidenceFactors,
          interpretation: scoreInterpretation,
          recommendation: score >= 50 ? 'Proceed with complaint drafting' : 'Review case viability'
        };
      }

      // ═══════════════════════════════════════════════════════════════════════════
      //                          LEGAL CONTENT GENERATION
      // ═══════════════════════════════════════════════════════════════════════════

      else if (name === 'draftComplaintLetter') {
        const { clientName, clientAddress, lenderName, accountNumber, loanDate, loanAmount, breaches, financialHarm, requestedRemedy } = args as any;

        const breachText = (breaches || []).map((b: any) => {
          const ruleDescriptions: Record<string, string> = {
            'CONC_5.2A.4R': 'Failed to assess whether the borrower could repay sustainably without undue difficulty',
            'CONC_5.2A.12R': 'Failed to verify income claims and relied solely on self-declaration',
            'CONC_5.2A.15G': 'Failed to consider committed regular expenditure',
            'CONC_5.2A.17G': 'Failed to check for signs of financial difficulty',
            'CONC_5.2A.20R': 'Failed to consider pattern of multiple loans indicating credit cycling',
            's140A_CCA': 'Created an unfair relationship under s.140A Consumer Credit Act 1974',
            'CONC_6.7': 'Failed to treat customer in financial difficulty with forbearance'
          };
          return `- ${b.type}: ${ruleDescriptions[b.type] || b.type}\n  ${b.description || ''}\n  Evidence: ${b.evidence || 'To be detailed'}`;
        }).join('\n\n');

        const letterContent = `FORMAL COMPLAINT - IRRESPONSIBLE LENDING

To: Complaints Department, ${lenderName}
From: ${clientName}
${clientAddress ? `Address: ${clientAddress}` : ''}
${accountNumber ? `Account Reference: ${accountNumber}` : ''}
${loanDate ? `Loan Date: ${loanDate}` : ''}
${loanAmount ? `Loan Amount: £${loanAmount}` : ''}

Dear Sir/Madam,

We write to formally complain about the lending provided to our client. We submit that this lending was irresponsible and in breach of the FCA's Consumer Credit Sourcebook (CONC).

REGULATORY BREACHES IDENTIFIED:

${breachText || 'Specific breaches to be detailed based on DSAR analysis.'}

FINANCIAL HARM:
${financialHarm || 'The client has suffered financial harm as a result of this irresponsible lending, including but not limited to accrued interest, charges, and associated financial distress.'}

REMEDY SOUGHT:
${requestedRemedy || 'We request a full refund of all interest and charges paid, plus 8% simple interest from the date of each payment, in line with FOS guidelines.'}

We expect a final response within 8 weeks. If we do not receive a satisfactory response, we will escalate this matter to the Financial Ombudsman Service.

Yours faithfully,
FastAction Claims
Acting on behalf of ${clientName}`;

        const docResult = await addDocument({
          name: `Complaint Letter - ${clientName} v ${lenderName}.docx`,
          category: 'Legal',
          type: 'docx'
        });

        return {
          success: true,
          documentId: docResult.id,
          preview: letterContent,
          breachCount: (breaches || []).length,
          nextSteps: ['Send to lender', 'Set 8-week reminder', 'Update claim status to Complaint Submitted']
        };
      }

      else if (name === 'draftFOSSubmission') {
        const { clientName, lenderName, caseReference, originalComplaintDate, finalResponseDate, finalResponseSummary, breachSummary, evidenceList, reliefSought, additionalArguments } = args as any;

        const submissionContent = `FINANCIAL OMBUDSMAN SERVICE - COMPLAINT SUBMISSION

Case Reference: ${caseReference || 'TBC'}
Complainant: ${clientName}
Respondent: ${lenderName}

TIMELINE:
- Original Complaint Date: ${originalComplaintDate || 'TBC'}
- Final Response Date: ${finalResponseDate || 'TBC'}

LENDER'S POSITION:
${finalResponseSummary || 'The lender rejected our complaint. Full details in attached Final Response Letter.'}

OUR SUBMISSION:

1. BREACH SUMMARY:
${breachSummary}

2. WHY THE LENDER'S RESPONSE IS INADEQUATE:
${additionalArguments || 'The lender has failed to properly address the regulatory breaches identified. Their affordability assessment at the time of lending was inadequate and did not comply with CONC 5.2A requirements.'}

3. EVIDENCE ENCLOSED:
${(evidenceList || ['Complaint Letter', 'Final Response Letter', 'Bank Statements', 'DSAR Response']).map((e: string, i: number) => `${i + 1}. ${e}`).join('\n')}

4. REMEDY SOUGHT:
${reliefSought || 'Refund of all interest and charges paid, plus 8% simple interest from the date of each payment.'}

We respectfully request that the Ombudsman upholds this complaint and directs the lender to provide appropriate redress.

Submitted by FastAction Claims on behalf of ${clientName}`;

        const docResult = await addDocument({
          name: `FOS Submission - ${clientName} v ${lenderName}.docx`,
          category: 'Legal',
          type: 'docx'
        });

        return {
          success: true,
          documentId: docResult.id,
          preview: submissionContent,
          nextSteps: ['Submit to FOS portal', 'Update claim status to FOS Submitted', 'Set reminder for FOS acknowledgement']
        };
      }

      else if (name === 'draftClientCommunication') {
        const { contactId, communicationType, subject, keyPoints, tone, includeNextSteps } = args as any;

        const contact = contactId ? contacts.find(c => c.id === contactId) : null;
        const clientName = contact?.fullName || 'Valued Client';

        const toneGreeting = tone === 'formal' ? 'Dear' : tone === 'urgent' ? 'URGENT:' : 'Hi';
        const toneSign = tone === 'formal' ? 'Yours faithfully,' : 'Best regards,';

        const templates: Record<string, string> = {
          status_update: `${toneGreeting} ${clientName},\n\nWe wanted to update you on the progress of your claim.\n\n${(keyPoints || ['Your case is progressing well']).map((p: string) => `• ${p}`).join('\n')}\n\n${includeNextSteps ? 'Next Steps:\n• We will be in touch with further updates\n• Please let us know if you have any questions\n' : ''}${toneSign}\nFastAction Claims Team`,
          document_request: `${toneGreeting} ${clientName},\n\nTo progress your claim, we require the following documents:\n\n${(keyPoints || ['Bank statements', 'ID verification']).map((p: string) => `• ${p}`).join('\n')}\n\nPlease upload these at your earliest convenience.\n\n${toneSign}\nFastAction Claims Team`,
          offer_discussion: `${toneGreeting} ${clientName},\n\nWe have received an offer from the lender regarding your claim.\n\n${(keyPoints || ['Offer details to be discussed']).map((p: string) => `• ${p}`).join('\n')}\n\nPlease contact us to discuss this offer and your options.\n\n${toneSign}\nFastAction Claims Team`,
          fos_update: `${toneGreeting} ${clientName},\n\nUpdate on your Financial Ombudsman Service case:\n\n${(keyPoints || ['FOS is reviewing your case']).map((p: string) => `• ${p}`).join('\n')}\n\n${toneSign}\nFastAction Claims Team`,
          welcome: `${toneGreeting} ${clientName},\n\nWelcome to FastAction Claims! We're pleased to be assisting you with your irresponsible lending claim.\n\n${(keyPoints || ['We will guide you through the process', 'Our team is here to help']).map((p: string) => `• ${p}`).join('\n')}\n\n${toneSign}\nFastAction Claims Team`,
          general_query: `${toneGreeting} ${clientName},\n\nThank you for your enquiry.\n\n${(keyPoints || ['Response to your query']).map((p: string) => `• ${p}`).join('\n')}\n\n${toneSign}\nFastAction Claims Team`
        };

        return {
          success: true,
          subject: subject || `Update on your claim - ${communicationType.replace('_', ' ')}`,
          content: templates[communicationType] || templates.general_query,
          contactId,
          communicationType
        };
      }

      // ═══════════════════════════════════════════════════════════════════════════
      //                          COMMUNICATION & AUTOMATION
      // ═══════════════════════════════════════════════════════════════════════════

      else if (name === 'sendCommunication') {
        const { contactId, platform, subject, message, templateId, attachments } = args as any;
        const contact = contacts.find(c => c.id === contactId);

        return {
          success: true,
          message: `${platform.toUpperCase()} sent to ${contact?.fullName || contactId}`,
          platform,
          recipient: contact?.email || contact?.phone || contactId,
          subject,
          preview: message.substring(0, 100) + '...'
        };
      }

      else if (name === 'triggerWorkflow') {
        const { workflowName, contactId, parameters } = args as any;
        return {
          success: true,
          message: `Workflow '${workflowName}' triggered successfully`,
          workflowName,
          contactId,
          parameters,
          triggeredAt: new Date().toISOString()
        };
      }

      else if (name === 'calendarAction') {
        const { action, title, date, duration, contactId, claimId, reminderType, description } = args as any;

        if (action === 'schedule') {
          const result = addAppointment({ title, date, contactId, description });
          return { ...result, reminderType, duration };
        } else if (action === 'list') {
          return {
            success: true,
            appointments: appointments.slice(0, 10),
            message: `Found ${appointments.length} appointments`
          };
        }
        return { success: false, message: 'Unsupported calendar action' };
      }

      // ═══════════════════════════════════════════════════════════════════════════
      //                          REPORTS & ANALYTICS
      // ═══════════════════════════════════════════════════════════════════════════

      else if (name === 'generateReport') {
        const { reportType, dateRange, filters, format } = args as any;

        const reportData: Record<string, any> = {
          pipeline_summary: {
            totalClaims: claims.length,
            totalContacts: contacts.length,
            totalValue: claims.reduce((sum, c) => sum + (c.claimValue || 0), 0),
            byPhase: {
              'Lead Generation': claims.filter(c => ['New Lead', 'Contact Attempted', 'Qualified Lead'].includes(c.status)).length,
              'Onboarding': claims.filter(c => c.status.includes('Onboarding') || c.status.includes('LOA')).length,
              'DSAR': claims.filter(c => c.status.includes('DSAR')).length,
              'Complaint': claims.filter(c => c.status.includes('Complaint')).length,
              'FOS': claims.filter(c => c.status.includes('FOS')).length,
              'Payments': claims.filter(c => c.status.includes('Offer') || c.status.includes('Payment')).length
            }
          },
          lender_performance: {
            lenders: [...new Set(claims.map(c => c.lender))].map(lender => ({
              name: lender,
              totalClaims: claims.filter(c => c.lender === lender).length,
              totalValue: claims.filter(c => c.lender === lender).reduce((sum, c) => sum + (c.claimValue || 0), 0)
            }))
          },
          aging_report: {
            claimsOver30Days: claims.filter(c => (c.daysInStage || 0) > 30).length,
            claimsOver60Days: claims.filter(c => (c.daysInStage || 0) > 60).length,
            claimsOver90Days: claims.filter(c => (c.daysInStage || 0) > 90).length
          }
        };

        return {
          success: true,
          reportType,
          generatedAt: new Date().toISOString(),
          data: reportData[reportType] || reportData.pipeline_summary,
          format
        };
      }

      else if (name === 'createTemplate') {
        const { name: templateName, category, content, description, variables } = args as any;
        return addTemplate({ name: templateName, category, content, description });
      }

      return { error: "Unknown tool", toolName: name };
    } catch (err: any) {
      console.error('Tool execution error:', name, err);
      return { error: err.message, toolName: name };
    }
  };

  const callClaudeAPI = async (
    message?: string,
    context?: string,
    toolResults?: { toolUseId: string; result: string }[]
  ): Promise<{ text: string; toolCalls: ToolCall[] }> => {
    const response = await fetch(`${API_BASE}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
        message,
        context,
        toolResults
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'API request failed');
    }

    const data = await response.json();
    return {
      text: data.text || '',
      toolCalls: data.toolCalls || []
    };
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    // Inject Context if available
    let contextString = "";
    if (activeContext) {
      contextString = `Viewing ${activeContext.type} ID: ${activeContext.id || 'N/A'} Name: ${activeContext.name || 'N/A'}`;
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // 1. Send message to Claude via API
      let response = await callClaudeAPI(input, contextString || undefined);

      // 2. Loop to handle potentially multiple function calls
      while (response.toolCalls && response.toolCalls.length > 0) {
        const toolResults: { toolUseId: string; result: string }[] = [];

        // Execute each requested tool
        for (const toolCall of response.toolCalls) {
          const result = await executeToolCall(toolCall.name, toolCall.input);
          toolResults.push({
            toolUseId: toolCall.id,
            result: JSON.stringify(result)
          });
        }

        // 3. Send tool results back to Claude
        response = await callClaudeAPI(undefined, undefined, toolResults);
      }

      // 4. Final Text Response
      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.text || "Task executed successfully.",
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMsg]);

    } catch (error: any) {
      console.error(error);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: `I encountered an error: ${error.message || 'Please check your connection.'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Slide-out Panel */}
      <div className={`fixed top-0 right-0 h-full w-full sm:w-[500px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100 bg-navy-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-orange rounded-lg text-white">
              <Bot size={20} />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight">FastAction AI</h2>
              <p className="text-[10px] text-gray-300 uppercase tracking-wider font-medium">Powered by Claude</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ChevronRight size={24} />
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 h-[calc(100%-140px)] bg-slate-50">
          {activeContext && (
            <div className="flex justify-center">
              <div className="bg-blue-50 text-blue-700 text-xs px-3 py-1 rounded-full border border-blue-100 flex items-center gap-2">
                <Sparkles size={10} /> Context: Viewing {activeContext.name || activeContext.type}
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-gray-200' : 'bg-navy-900 text-white shadow-md'}`}>
                {msg.role === 'user' ? <span className="text-xs font-bold text-gray-600">You</span> : <Sparkles size={14} />}
              </div>

              <div
                className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                    ? 'bg-white text-gray-800 border border-gray-100 rounded-tr-none'
                    : 'bg-white text-navy-900 border-l-4 border-brand-orange rounded-tl-none'
                  }`}
              >
                <div className="whitespace-pre-wrap font-sans">{msg.text}</div>

                {/* Visual Cards for AI Actions */}
                {msg.role === 'model' && msg.id !== 'welcome' && (
                  <div className="mt-3 pt-3 border-t border-gray-100/20 flex flex-wrap gap-2">
                    {(msg.text.toLowerCase().includes("score") || msg.text.includes("qualification")) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded border border-green-100 font-bold">
                        <BarChart2 size={12} /> Analysis Complete
                      </span>
                    )}
                    {(msg.text.toLowerCase().includes("appointment") || msg.text.toLowerCase().includes("scheduled") || msg.text.toLowerCase().includes("reminder")) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded border border-purple-100 font-bold">
                        <Calendar size={12} /> Calendar Updated
                      </span>
                    )}
                    {(msg.text.toLowerCase().includes("updated") || msg.text.toLowerCase().includes("moved") || msg.text.toLowerCase().includes("status")) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded border border-blue-100 font-bold">
                        <CheckCircle size={12} /> CRM Updated
                      </span>
                    )}
                    {(msg.text.toLowerCase().includes("complaint") || msg.text.toLowerCase().includes("draft") || msg.text.toLowerCase().includes("letter") || msg.text.toLowerCase().includes("fos submission")) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded border border-amber-100 font-bold">
                        <FileText size={12} /> Document Generated
                      </span>
                    )}
                    {(msg.text.toLowerCase().includes("conc") || msg.text.toLowerCase().includes("fca") || msg.text.toLowerCase().includes("breach")) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 text-xs rounded border border-red-100 font-bold">
                        <FileText size={12} /> Compliance Analysis
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-navy-900 text-white flex items-center justify-center flex-shrink-0">
                <Bot size={18} />
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center gap-3">
                <Loader2 size={16} className="animate-spin text-brand-orange" />
                <span className="text-xs text-gray-500 font-medium">Processing operations...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 w-full p-4 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={activeContext ? `Ask about ${activeContext.name}...` : "e.g. 'Move all Vanquis claims to FOS'"}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-navy-900 transition-shadow placeholder:text-gray-400"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="bg-navy-900 hover:bg-navy-800 text-white p-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-md"
            >
              <Send size={20} />
            </button>
          </div>
          <div className="text-center mt-2 flex justify-center flex-wrap gap-3">
            <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
              <BarChart2 size={10} /> Analytics
            </span>
            <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
              <FileText size={10} /> Legal Drafting
            </span>
            <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
              <CheckCircle size={10} /> CONC Compliance
            </span>
            <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
              <Calendar size={10} /> Automation
            </span>
          </div>
        </div>
      </div>
    </>
  );
};

export default AIAssistant;
