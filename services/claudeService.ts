import Anthropic from "@anthropic-ai/sdk";

// Initialize Claude Client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// --- Tool Definitions (Function Calling) ---

const tools: Anthropic.Messages.Tool[] = [
  {
    name: "updateClaimStatus",
    description: "Moves a specific claim to a different stage in the pipeline.",
    input_schema: {
      type: "object",
      properties: {
        claimId: { type: "string", description: "The ID of the claim to update" },
        newStatus: { type: "string", description: "The exact new status string from the pipeline." }
      },
      required: ["claimId", "newStatus"]
    }
  },
  {
    name: "manageClaim",
    description: "Creates a new claim opportunity or updates details of an existing claim (value, lender, product type).",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create", "update"], description: "The action to perform" },
        contactId: { type: "string", description: "Required for creation." },
        claimId: { type: "string", description: "Required for update." },
        lender: { type: "string" },
        claimValue: { type: "number" },
        status: { type: "string" },
        productType: { type: "string" }
      },
      required: ["action"]
    }
  },
  {
    name: "createContact",
    description: "Creates a new contact record in the CRM.",
    input_schema: {
      type: "object",
      properties: {
        fullName: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        lender: { type: "string" },
        claimValue: { type: "number" }
      },
      required: ["fullName"]
    }
  },
  {
    name: "getPipelineStats",
    description: "Retrieves current dashboard KPIs, total pipeline value, and claim counts by stage.",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "analyzeFinancials",
    description: "Analyzes financial text to extract income, recurring expenses, gambling transactions, and calculates a 'Case Qualification Score' (0-100) based on affordability metrics.",
    input_schema: {
      type: "object",
      properties: {
        textData: { type: "string", description: "Raw text from Bank Statements or DSAR." },
        docType: { type: "string", enum: ["Bank Statement", "DSAR", "Credit Report"] }
      },
      required: ["textData"]
    }
  },
  {
    name: "sendCommunication",
    description: "Sends a message to a client via their preferred platform (WhatsApp, Email, etc.).",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        platform: { type: "string", enum: ["email", "sms", "whatsapp"] },
        message: { type: "string", description: "The content of the message to send." }
      },
      required: ["contactId", "platform", "message"]
    }
  },
  {
    name: "draftComplianceDocument",
    description: "Generates a formal legal document citing specific FCA regulations and FOS precedents based on the case details.",
    input_schema: {
      type: "object",
      properties: {
        docType: { type: "string", enum: ["Complaint Letter", "FOS Submission", "Settlement Rejection"] },
        clientName: { type: "string" },
        lenderName: { type: "string" },
        breachDetails: { type: "string", description: "Specific FCA CONC breaches or irresponsible lending indicators identified." }
      },
      required: ["docType", "clientName", "lenderName"]
    }
  },
  {
    name: "triggerWorkflow",
    description: "Triggers an automated workflow sequence in the system.",
    input_schema: {
      type: "object",
      properties: {
        workflowName: { type: "string", description: "Name of the workflow to trigger (e.g., 'New Lead Sequence', 'DSAR Follow-up')." }
      },
      required: ["workflowName"]
    }
  },
  {
    name: "createTemplate",
    description: "Saves a text as a reusable template.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        content: { type: "string" }
      },
      required: ["name", "content"]
    }
  },
  {
    name: "searchCRM",
    description: "Searches the database for specific records. Use this to find IDs or status.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name, email, or ID to search for." },
        entityType: { type: "string", enum: ["contact", "claim", "document", "all"], description: "The type of entity to search." }
      },
      required: ["query"]
    }
  },
  {
    name: "bulkClaimOperation",
    description: "Performs bulk actions on multiple claims matching specific criteria. Useful for 'Move all Vanquis claims...' commands.",
    input_schema: {
      type: "object",
      properties: {
        lender: { type: "string", description: "Filter claims by this lender." },
        currentStatus: { type: "string", description: "Filter claims currently in this status." },
        minDaysInStage: { type: "number", description: "Filter claims stuck in stage for more than X days." },
        action: { type: "string", enum: ["updateStatus"], description: "The action to perform." },
        newValue: { type: "string", description: "The new status to apply." }
      },
      required: ["action", "newValue"]
    }
  },
  {
    name: "calendarAction",
    description: "Schedules appointments or reminders in the calendar.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["schedule"] },
        title: { type: "string" },
        date: { type: "string", description: "ISO date string or natural language description." },
        contactId: { type: "string", description: "Optional contact to link." },
        description: { type: "string" }
      },
      required: ["action", "title", "date"]
    }
  }
];

// --- System Instruction ---

const SYSTEM_INSTRUCTION = `
You are 'FastAction AI', the Senior Legal Operations Manager for a UK law firm specializing in Irresponsible Lending claims.
You are a Critical Component of the CRM, not just a chatbot. You have READ/WRITE access to the database.

**YOUR AUTHORITY & CAPABILITIES:**
1.  **Pipeline Control:** You can move cases through the 48-stage pipeline.
2.  **Data Management:** You create/update contacts and claims. You can search the database.
3.  **Financial Analysis:** You analyze bank statements for affordability (Disposable Income, Gambling, etc.).
4.  **Legal Drafting:** You draft formal complaints citing FCA CONC 5.2A and FOS precedents.
5.  **Automation:** You trigger workflows and schedule appointments.

**PIPELINE STAGES & RULES (Do NOT rename these):**
*   **Lead Gen:** New Lead, Contact Attempted, Qualified Lead.
*   **Onboarding:** Onboarding Started, ID Verification Pending, POA Required, ID Verified, LOA Uploaded, LOA Signed, Bank Statements Received.
*   **DSAR:** DSAR Prepared, DSAR Sent to Lender, DSAR Acknowledged, DSAR Follow-up Sent, DSAR Received.
*   **Complaint:** Complaint Drafted, Client Review, Complaint Submitted, Response Received.
*   **FOS:** FOS Referral Prepared, FOS Submitted, FOS Investigation, FOS Final Decision.
*   **Payments:** Offer Received, Offer Accepted, Payment Received, Fee Deducted, Client Paid.
*   **Debt Recovery:** Debt Recovery Initiated, Payment Plan Agreed, Debt Collection Started, Debt Settled.

**BEHAVIORAL RULES:**
*   **Context Awareness:** You will be provided with the user's "Current Context". Use this implicitly. If the user says "Update his address", assume they mean the contact in the current context.
*   **Bulk Actions:** If a user asks to "Move all X claims...", use the \`bulkClaimOperation\` tool. Do not ask for IDs one by one.
*   **Searching:** If you need to find a client ("Who is John?"), use \`searchCRM\` first. Do not hallucinate data.
*   **Drafting:** When drafting, be professional and legally precise. Mention "Failure to assess creditworthiness" and "Unfair relationship" (s.140A CCA 1974).

**INTERACTION STYLE:**
*   Be concise and operational.
*   Confirm actions visually (the UI handles this via your tool outputs).
*   If a request is destructive (e.g., "Delete all contacts"), ask for explicit confirmation in text first.
`;

// Export tools for use in tool execution handlers
export { tools };

// Helper function to extract text from response content
function extractTextFromContent(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
    .map(block => block.text)
    .join("\n");
}

// Helper function to extract tool calls from response content
function extractToolCalls(content: Anthropic.Messages.ContentBlock[]): Anthropic.Messages.ToolUseBlock[] {
  return content.filter((block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use");
}

// Chat session class to maintain conversation state
export class ClaudeChatSession {
  private messages: Anthropic.Messages.MessageParam[] = [];
  private model: string = "claude-sonnet-4-20250514";

  async sendMessage(userMessage: string, context?: string): Promise<{
    text: string;
    toolCalls: Anthropic.Messages.ToolUseBlock[];
  }> {
    // Build the user message with optional context
    const fullMessage = context
      ? `Current Context:\n${context}\n\nUser Request: ${userMessage}`
      : userMessage;

    this.messages.push({
      role: "user",
      content: fullMessage
    });

    const response = await anthropic.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: SYSTEM_INSTRUCTION,
      tools: tools,
      messages: this.messages
    });

    const responseText = extractTextFromContent(response.content);
    const toolCalls = extractToolCalls(response.content);

    // Store assistant response in history
    this.messages.push({
      role: "assistant",
      content: response.content
    });

    return {
      text: responseText,
      toolCalls: toolCalls
    };
  }

  // Add tool results back to the conversation
  async addToolResults(toolResults: { toolUseId: string; result: string }[]): Promise<{
    text: string;
    toolCalls: Anthropic.Messages.ToolUseBlock[];
  }> {
    const toolResultContent: Anthropic.Messages.ToolResultBlockParam[] = toolResults.map(tr => ({
      type: "tool_result" as const,
      tool_use_id: tr.toolUseId,
      content: tr.result
    }));

    this.messages.push({
      role: "user",
      content: toolResultContent
    });

    const response = await anthropic.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: SYSTEM_INSTRUCTION,
      tools: tools,
      messages: this.messages
    });

    const responseText = extractTextFromContent(response.content);
    const toolCalls = extractToolCalls(response.content);

    this.messages.push({
      role: "assistant",
      content: response.content
    });

    return {
      text: responseText,
      toolCalls: toolCalls
    };
  }

  clearHistory(): void {
    this.messages = [];
  }
}

// Factory function to create chat sessions
export const createChatSession = (): ClaudeChatSession => {
  return new ClaudeChatSession();
};

/**
 * Extracts contact information from unstructured text or raw content.
 */
export const parseDocumentContent = async (text: string): Promise<any[]> => {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Extract contact/claim information from the following text.
Return a JSON array where each object has: fullName, email, phone, lender, claimValue (number), status (default to "New Lead").
Also extract address fields if available: addressLine1, city, postalCode.

IMPORTANT: Return ONLY valid JSON array, no markdown code blocks or explanation.

Text to parse:
${text.substring(0, 20000)}`
        }
      ]
    });

    const responseText = extractTextFromContent(response.content);
    if (!responseText) return [];

    let jsonStr = responseText.trim();

    // Clean up potential markdown code blocks
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    return JSON.parse(jsonStr.trim());
  } catch (e) {
    console.error("AI Parse Error", e);
    return [];
  }
};

/**
 * Analyzes financial documents for affordability assessment.
 * Returns structured analysis with income, expenses, and qualification score.
 */
export const analyzeFinancialDocument = async (
  textData: string,
  docType: "Bank Statement" | "DSAR" | "Credit Report"
): Promise<{
  monthlyIncome: number;
  monthlyExpenses: number;
  gamblingTransactions: { date: string; amount: number; description: string }[];
  disposableIncome: number;
  qualificationScore: number;
  redFlags: string[];
  summary: string;
}> => {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Analyze this ${docType} for an irresponsible lending claim assessment.

Extract and calculate:
1. Monthly income (salary, benefits, regular deposits)
2. Monthly essential expenses (rent, utilities, food, transport)
3. All gambling transactions (date, amount, description)
4. Disposable income (income - expenses)
5. Case Qualification Score (0-100) based on:
   - Evidence of gambling during financial hardship
   - Ratio of gambling to disposable income
   - Signs of credit cycling or multiple lending
   - Clear affordability breaches

Return as JSON with this exact structure:
{
  "monthlyIncome": number,
  "monthlyExpenses": number,
  "gamblingTransactions": [{"date": "string", "amount": number, "description": "string"}],
  "disposableIncome": number,
  "qualificationScore": number,
  "redFlags": ["string"],
  "summary": "string"
}

Document text:
${textData.substring(0, 30000)}`
        }
      ]
    });

    const responseText = extractTextFromContent(response.content);
    if (!responseText) {
      throw new Error("No response text");
    }

    let jsonStr = responseText.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    return JSON.parse(jsonStr.trim());
  } catch (e) {
    console.error("Financial Analysis Error", e);
    return {
      monthlyIncome: 0,
      monthlyExpenses: 0,
      gamblingTransactions: [],
      disposableIncome: 0,
      qualificationScore: 0,
      redFlags: [],
      summary: "Analysis failed - please review manually"
    };
  }
};

/**
 * Drafts a compliance document based on case details.
 */
export const draftDocument = async (
  docType: "Complaint Letter" | "FOS Submission" | "Settlement Rejection",
  clientName: string,
  lenderName: string,
  breachDetails?: string,
  caseDetails?: string
): Promise<string> => {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: `Draft a formal ${docType} for an irresponsible lending claim.

Client: ${clientName}
Lender: ${lenderName}
${breachDetails ? `Breach Details: ${breachDetails}` : ""}
${caseDetails ? `Case Details: ${caseDetails}` : ""}

Requirements:
- Use formal legal language appropriate for UK financial complaints
- Cite relevant FCA CONC regulations (especially CONC 5.2A on creditworthiness assessment)
- Reference s.140A Consumer Credit Act 1974 (unfair relationship)
- Include specific FOS precedent references where applicable
- Structure with clear headings and numbered paragraphs
- Be assertive but professional

Return the complete document text ready for review.`
        }
      ]
    });

    const responseText = extractTextFromContent(response.content);
    return responseText || "Document generation failed";
  } catch (e) {
    console.error("Document Draft Error", e);
    return "Error generating document. Please try again.";
  }
};
