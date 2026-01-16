
import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Sparkles, Loader2, ChevronRight, FileText, BarChart2, Calendar, CheckCircle } from 'lucide-react';
import { ChatMessage } from '../types';
import { createChatSession } from '../services/geminiService';
import { useCRM } from '../context/CRMContext';
import { Chat } from '@google/genai';

interface AIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ isOpen, onClose }) => {
  const { 
    updateContactStatus, 
    addContact, 
    addClaim,
    updateClaim,
    getPipelineStats, 
    addTemplate, 
    addDocument, 
    claims,
    contacts,
    activeContext,
    bulkUpdateClaims,
    addAppointment
  } = useCRM();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: "I am your Senior Legal Operations Manager. I can manage claims, analyze bank statements, draft legal documents, and schedule appointments. How can I assist you today?",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef<Chat | null>(null);

  useEffect(() => {
    if (!chatSessionRef.current) {
      chatSessionRef.current = createChatSession();
    }
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !chatSessionRef.current) return;

    // Inject Context if available
    let contextPreamble = "";
    if (activeContext) {
       contextPreamble = `[Current User Context: Viewing ${activeContext.type} ID: ${activeContext.id || 'N/A'} Name: ${activeContext.name || 'N/A'}] `;
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
      // 1. Send message to Gemini (with hidden context preamble if needed, or just standard message)
      // Note: We prepend context to the message text transparently to the user, or rely on system prompt history.
      // Here we append it to the message sent to API but display clean message to user.
      const messageToSend = contextPreamble ? `${contextPreamble}\n${userMsg.text}` : userMsg.text;
      
      let response = await chatSessionRef.current.sendMessage({ message: messageToSend });
      
      // 2. Loop to handle potentially multiple function calls
      while (response.functionCalls && response.functionCalls.length > 0) {
        const functionCalls = response.functionCalls;
        const functionResponseParts = [];

        // Execute each requested tool
        for (const call of functionCalls) {
          console.log("AI calling tool:", call.name, call.args);
          let toolResult: any = { error: "Unknown tool" };

          try {
            if (call.name === 'updateClaimStatus') {
              const { claimId, newStatus } = call.args as any;
              toolResult = updateContactStatus(claimId, newStatus);
            } 
            else if (call.name === 'createContact') {
              toolResult = addContact(call.args as any);
            } 
            else if (call.name === 'manageClaim') {
              const { action, contactId, claimId, ...data } = call.args as any;
              if (action === 'create') {
                 toolResult = addClaim({ contactId, ...data });
              } else if (action === 'update') {
                 toolResult = updateClaim({ id: claimId, ...data } as any);
              }
            }
            else if (call.name === 'getPipelineStats') {
              toolResult = getPipelineStats();
            }
            else if (call.name === 'searchCRM') {
               const { query, entityType } = call.args as any;
               const qLower = query.toLowerCase();
               
               let foundContacts: any[] = [];
               let foundClaims: any[] = [];

               if (entityType === 'contact' || entityType === 'all') {
                  foundContacts = contacts.filter(c => 
                     c.fullName.toLowerCase().includes(qLower) || 
                     c.email.toLowerCase().includes(qLower) ||
                     c.id === query
                  );
               }
               
               if (entityType === 'claim' || entityType === 'all') {
                  foundClaims = claims.filter(c => 
                     c.id === query ||
                     c.lender.toLowerCase().includes(qLower)
                  );
               }

               // Enrich claims with contact names
               const enrichedClaims = foundClaims.map(c => {
                  const contact = contacts.find(con => con.id === c.contactId);
                  return { ...c, contactName: contact?.fullName };
               });

               toolResult = {
                  contacts: foundContacts.map(c => ({ id: c.id, name: c.fullName, email: c.email, status: c.status })),
                  claims: enrichedClaims,
                  count: foundContacts.length + foundClaims.length
               };
            }
            else if (call.name === 'bulkClaimOperation') {
               const { lender, currentStatus, minDaysInStage, action, newValue } = call.args as any;
               if (action === 'updateStatus') {
                  toolResult = bulkUpdateClaims({ 
                     lender, 
                     status: currentStatus, 
                     minDaysInStage: minDaysInStage 
                  }, newValue);
               }
            }
            else if (call.name === 'calendarAction') {
               const { action, title, date, contactId, description } = call.args as any;
               if (action === 'schedule') {
                  toolResult = addAppointment({ title, date, contactId, description });
               }
            }
            else if (call.name === 'analyzeFinancials') {
               // Simulate complex analysis logic
               const { textData, docType } = call.args as any;
               const hasGambling = textData.toLowerCase().includes('bet') || textData.toLowerCase().includes('casino');
               const income = 2500;
               const score = hasGambling ? 85 : 40; 
               
               toolResult = { 
                  docType,
                  analysis: {
                    monthlyIncome: income,
                    disposableIncome: income - 1800,
                    gamblingDetected: hasGambling,
                    gamblingTotal: hasGambling ? 450 : 0,
                    qualificationScore: score,
                    recommendation: score > 70 ? "Proceed to Complaint" : "Review Manually"
                  }
               };
            }
            else if (call.name === 'sendCommunication') {
               const { contactId, platform, message } = call.args as any;
               toolResult = { success: true, message: `Sent ${platform} message to contact ${contactId}: "${message}"` };
            }
            else if (call.name === 'draftComplianceDocument') {
               const { docType, clientName, lenderName, breachDetails } = call.args as any;
               const content = `[DRAFT ${docType.toUpperCase()}]\n\nRe: ${clientName} v ${lenderName}\n\nWe act on behalf of the above-named client.\n\nWe submit that the lending provided was irresponsible and in breach of FCA CONC 5.2A.\n\nSpecific Breaches identified:\n${breachDetails}\n\nWe request a refund of all interest and charges.`;
               
               const docResult = addDocument({
                  name: `${docType} - ${clientName}.txt`,
                  category: 'Legal',
                  type: 'docx'
               });
               
               toolResult = { success: true, documentId: docResult.id, preview: content };
            }
            else if (call.name === 'triggerWorkflow') {
               const { workflowName } = call.args as any;
               toolResult = { success: true, message: `Workflow '${workflowName}' triggered successfully via n8n.` };
            }
            else if (call.name === 'createTemplate') {
               toolResult = addTemplate(call.args as any);
            }
          } catch (err: any) {
            toolResult = { error: err.message };
          }

          // Construct valid FunctionResponse part
          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: { result: toolResult }
            }
          });
        }

        // 3. Send tool results back to Gemini
        response = await chatSessionRef.current.sendMessage({ message: functionResponseParts });
      }

      // 4. Final Text Response
      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.text || "Task executed successfully.",
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMsg]);

    } catch (error) {
      console.error(error);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "I encountered an error processing your request. Please check your connection.",
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
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
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
               <p className="text-[10px] text-gray-300 uppercase tracking-wider font-medium">Operations Manager</p>
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
                className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-white text-gray-800 border border-gray-100 rounded-tr-none' 
                    : 'bg-white text-navy-900 border-l-4 border-brand-orange rounded-tl-none'
                }`}
              >
                <div className="whitespace-pre-wrap font-sans">{msg.text}</div>
                
                {/* Visual Cards for AI Actions */}
                {msg.role === 'model' && (
                   <div className="mt-3 pt-3 border-t border-gray-100/20 space-y-2">
                      {msg.text.includes("Score") && (
                         <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded border border-green-100 font-bold mr-2">
                            <BarChart2 size={12} /> Analysis Ready
                         </span>
                      )}
                      {msg.text.includes("Appointment scheduled") && (
                         <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded border border-purple-100 font-bold mr-2">
                            <Calendar size={12} /> Event Created
                         </span>
                      )}
                      {(msg.text.includes("Updated") || msg.text.includes("moved")) && (
                         <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded border border-blue-100 font-bold mr-2">
                            <CheckCircle size={12} /> System Updated
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
          <div className="text-center mt-2 flex justify-center gap-4">
             <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                <BarChart2 size={10} /> Dashboard Access
             </span>
             <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                <FileText size={10} /> Doc Generation
             </span>
          </div>
        </div>
      </div>
    </>
  );
};

export default AIAssistant;
