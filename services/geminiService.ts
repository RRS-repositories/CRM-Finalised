
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Tool Definitions (Function Calling) ---

const updateClaimStatusTool: FunctionDeclaration = {
  name: "updateClaimStatus",
  parameters: {
    type: Type.OBJECT,
    properties: {
      claimId: { type: Type.STRING, description: "The ID of the claim to update" },
      newStatus: { type: Type.STRING, description: "The exact new status string from the pipeline." }
    },
    required: ["claimId", "newStatus"],
    description: "Moves a specific claim to a different stage in the pipeline."
  }
};

const manageClaimTool: FunctionDeclaration = {
  name: "manageClaim",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: { type: Type.STRING, enum: ["create", "update"] },
      contactId: { type: Type.STRING, description: "Required for creation." },
      claimId: { type: Type.STRING, description: "Required for update." },
      lender: { type: Type.STRING },
      claimValue: { type: Type.NUMBER },
      status: { type: Type.STRING },
      productType: { type: Type.STRING }
    },
    required: ["action"],
    description: "Creates a new claim opportunity or updates details of an existing claim (value, lender, product type)."
  }
};

const createContactTool: FunctionDeclaration = {
  name: "createContact",
  parameters: {
    type: Type.OBJECT,
    properties: {
      fullName: { type: Type.STRING },
      phone: { type: Type.STRING },
      email: { type: Type.STRING },
      lender: { type: Type.STRING },
      claimValue: { type: Type.NUMBER }
    },
    required: ["fullName"],
    description: "Creates a new contact record in the CRM."
  }
};

const getPipelineStatsTool: FunctionDeclaration = {
  name: "getPipelineStats",
  parameters: {
    type: Type.OBJECT,
    properties: {},
    description: "Retrieves current dashboard KPIs, total pipeline value, and claim counts by stage."
  }
};

const analyzeFinancialsTool: FunctionDeclaration = {
  name: "analyzeFinancials",
  parameters: {
    type: Type.OBJECT,
    properties: {
      textData: { type: Type.STRING, description: "Raw text from Bank Statements or DSAR." },
      docType: { type: Type.STRING, enum: ["Bank Statement", "DSAR", "Credit Report"] }
    },
    required: ["textData"],
    description: "Analyzes financial text to extract income, recurring expenses, gambling transactions, and calculates a 'Case Qualification Score' (0-100) based on affordability metrics."
  }
};

const sendCommunicationTool: FunctionDeclaration = {
  name: "sendCommunication",
  parameters: {
    type: Type.OBJECT,
    properties: {
      contactId: { type: Type.STRING },
      platform: { type: Type.STRING, enum: ["email", "sms", "whatsapp"] },
      message: { type: Type.STRING, description: "The content of the message to send." }
    },
    required: ["contactId", "platform", "message"],
    description: "Sends a message to a client via their preferred platform (WhatsApp, Email, etc.)."
  }
};

const draftComplianceDocumentTool: FunctionDeclaration = {
  name: "draftComplianceDocument",
  parameters: {
    type: Type.OBJECT,
    properties: {
      docType: { type: Type.STRING, enum: ["Complaint Letter", "FOS Submission", "Settlement Rejection"] },
      clientName: { type: Type.STRING },
      lenderName: { type: Type.STRING },
      breachDetails: { type: Type.STRING, description: "Specific FCA CONC breaches or irresponsible lending indicators identified." }
    },
    required: ["docType", "clientName", "lenderName"],
    description: "Generates a formal legal document citing specific FCA regulations and FOS precedents based on the case details."
  }
};

const triggerWorkflowTool: FunctionDeclaration = {
  name: "triggerWorkflow",
  parameters: {
    type: Type.OBJECT,
    properties: {
      workflowName: { type: Type.STRING, description: "Name of the workflow to trigger (e.g., 'New Lead Sequence', 'DSAR Follow-up')." }
    },
    required: ["workflowName"],
    description: "Triggers an automated workflow sequence in the system."
  }
};

const createTemplateTool: FunctionDeclaration = {
  name: "createTemplate",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      content: { type: Type.STRING }
    },
    required: ["name", "content"],
    description: "Saves a text as a reusable template."
  }
};

const searchCRMTool: FunctionDeclaration = {
  name: "searchCRM",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "Name, email, or ID to search for." },
      entityType: { type: Type.STRING, enum: ["contact", "claim", "document", "all"], description: "The type of entity to search." }
    },
    required: ["query"],
    description: "Searches the database for specific records. Use this to find IDs or status."
  }
};

const bulkClaimOperationTool: FunctionDeclaration = {
  name: "bulkClaimOperation",
  parameters: {
    type: Type.OBJECT,
    properties: {
      lender: { type: Type.STRING, description: "Filter claims by this lender." },
      currentStatus: { type: Type.STRING, description: "Filter claims currently in this status." },
      minDaysInStage: { type: Type.NUMBER, description: "Filter claims stuck in stage for more than X days." },
      action: { type: Type.STRING, enum: ["updateStatus"], description: "The action to perform." },
      newValue: { type: Type.STRING, description: "The new status to apply." }
    },
    required: ["action", "newValue"],
    description: "Performs bulk actions on multiple claims matching specific criteria. Useful for 'Move all Vanquis claims...' commands."
  }
};

const calendarActionTool: FunctionDeclaration = {
  name: "calendarAction",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: { type: Type.STRING, enum: ["schedule"] },
      title: { type: Type.STRING },
      date: { type: Type.STRING, description: "ISO date string or natural language description." },
      contactId: { type: Type.STRING, description: "Optional contact to link." },
      description: { type: Type.STRING }
    },
    required: ["action", "title", "date"],
    description: "Schedules appointments or reminders in the calendar."
  }
};

export const tools = [
  manageClaimTool,
  updateClaimStatusTool, 
  createContactTool, 
  getPipelineStatsTool, 
  analyzeFinancialsTool,
  sendCommunicationTool,
  draftComplianceDocumentTool,
  triggerWorkflowTool,
  createTemplateTool,
  searchCRMTool,
  bulkClaimOperationTool,
  calendarActionTool
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
*   **Onboarding:** Onboarding Started, ID Verification Pending, ID Verified, LOA Signed, Bank Statements Received.
*   **DSAR:** DSAR Prepared, DSAR Sent to Lender, DSAR Acknowledged, DSAR Follow-up Sent, DSAR Received.
*   **Complaint:** Complaint Drafted, Client Review, Complaint Submitted, Response Received.
*   **FOS:** FOS Referral Prepared, FOS Submitted, FOS Investigation, FOS Final Decision.
*   **Resolution:** Offer Received, Offer Accepted, Payment Received, Fee Deducted, Client Paid.

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

export const createChatSession = () => {
  return ai.chats.create({
    model: 'gemini-3-pro-preview', // Upgraded to Pro for complex reasoning
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ functionDeclarations: tools }],
      thinkingConfig: { thinkingBudget: 2048 } // Enable thinking for complex analysis
    }
  });
};

/**
 * Extracts contact information from unstructured text or raw content.
 */
export const parseDocumentContent = async (text: string): Promise<any[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Extract contact/claim information from the following text.
      Return a JSON array where each object has: fullName, email, phone, lender, claimValue (number), status (default to "New Lead").
      Also extract address fields if available: addressLine1, city, postalCode.
      
      Text to parse:
      ${text.substring(0, 20000)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
           type: Type.ARRAY,
           items: {
             type: Type.OBJECT,
             properties: {
               fullName: { type: Type.STRING },
               email: { type: Type.STRING },
               phone: { type: Type.STRING },
               lender: { type: Type.STRING },
               claimValue: { type: Type.NUMBER },
               status: { type: Type.STRING },
               addressLine1: { type: Type.STRING },
               city: { type: Type.STRING },
               postalCode: { type: Type.STRING }
             }
           }
        }
      }
    });
    
    let jsonStr = response.text || '[]';
    jsonStr = jsonStr.trim();
    if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '');
    } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '');
    }
    
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("AI Parse Error", e);
    return [];
  }
};
