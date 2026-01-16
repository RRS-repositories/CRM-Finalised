
import React, { useCallback, useRef } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap, 
  ReactFlowProvider,
  useReactFlow
} from 'reactflow';
// CSS is now loaded in index.html via CDN
import { useWorkflowStore } from '../../stores/workflowStore';
import { nodeTypes } from './nodeTypes';
import { 
  Save, 
  Play, 
  ArrowLeft, 
  Zap, 
  Mail, 
  Database, 
  GitBranch, 
  BrainCircuit, 
  Plus, 
  Settings,
  Clock,
  MessageSquare,
  Globe
} from 'lucide-react';
import { n8nApi } from '../../services/n8nApi';
import { useCRM } from '../../context/CRMContext'; // Import for theme detection

interface WorkflowBuilderProps {
  onBack: () => void;
}

const WorkflowBuilderContent: React.FC<WorkflowBuilderProps> = ({ onBack }) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { project } = useReactFlow();
  const { 
    nodes, 
    edges, 
    onNodesChange, 
    onEdgesChange, 
    onConnect, 
    addNode, 
    workflowName, 
    saveWorkflow,
    isLoading,
    workflowId
  } = useWorkflowStore();
  const { theme } = useCRM(); // Get current theme

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const type = event.dataTransfer.getData('application/reactflow');
      const label = event.dataTransfer.getData('application/label');
      const n8nType = event.dataTransfer.getData('application/n8nType');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const newNode = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: { 
           label: label || 'New Node', 
           type,
           nodeType: n8nType 
        },
      };

      addNode(newNode as any);
    },
    [project, addNode]
  );

  const handleExecute = async () => {
     if(workflowId) {
        try {
           alert("Executing Workflow...");
           await n8nApi.executeWorkflow(workflowId);
           alert("Execution Started Successfully");
        } catch (e) {
           alert("Failed to execute. Ensure n8n is reachable.");
        }
     }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 transition-colors">
      {/* Toolbar */}
      <div className="h-16 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between px-6 z-10 shadow-sm flex-shrink-0">
         <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
               <ArrowLeft size={20} />
            </button>
            <div className="h-8 w-px bg-gray-200 dark:bg-slate-700"></div>
            <div>
               <h2 className="font-bold text-navy-900 dark:text-white">{workflowName}</h2>
               <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  Auto-saving enabled
               </div>
            </div>
         </div>
         
         <div className="flex gap-3">
            <button 
               onClick={handleExecute}
               className="px-4 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
               <Play size={16} /> Execute Test
            </button>
            <button 
               onClick={() => saveWorkflow()}
               disabled={isLoading}
               className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2 disabled:opacity-70"
            >
               <Save size={16} /> {isLoading ? 'Saving...' : 'Save Workflow'}
            </button>
         </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
         {/* Sidebar / Palette */}
         <div className="w-64 bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10">
            <div className="p-4 border-b border-gray-100 dark:border-slate-700">
               <h3 className="font-bold text-sm text-navy-900 dark:text-white">Nodes</h3>
               <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Drag and drop to canvas</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
               <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Triggers</h4>
                  <div className="space-y-2">
                     <DraggableNode type="trigger" label="Webhook" n8nType="n8n-nodes-base.webhook" icon={Zap} color="green" />
                     <DraggableNode type="trigger" label="Schedule" n8nType="n8n-nodes-base.cron" icon={Clock} color="green" />
                     <DraggableNode type="trigger" label="On Form Submit" n8nType="n8n-nodes-base.formTrigger" icon={Zap} color="green" />
                  </div>
               </div>

               <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Actions</h4>
                  <div className="space-y-2">
                     <DraggableNode type="action" label="Send Email" n8nType="n8n-nodes-base.emailSend" icon={Mail} color="blue" />
                     <DraggableNode type="action" label="Send SMS" n8nType="n8n-nodes-base.twilio" icon={MessageSquare} color="blue" />
                     <DraggableNode type="action" label="CRM: Update Contact" n8nType="n8n-nodes-base.crm" icon={Database} color="blue" />
                     <DraggableNode type="action" label="HTTP Request" n8nType="n8n-nodes-base.httpRequest" icon={Globe} color="blue" />
                  </div>
               </div>

               <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Logic</h4>
                  <div className="space-y-2">
                     <DraggableNode type="condition" label="If / Else" n8nType="n8n-nodes-base.if" icon={GitBranch} color="yellow" />
                     <DraggableNode type="ai" label="AI Analysis" n8nType="n8n-nodes-base.openAi" icon={BrainCircuit} color="purple" />
                  </div>
               </div>
            </div>
         </div>

         {/* React Flow Canvas */}
         <div className="flex-1 relative" ref={reactFlowWrapper}>
            <ReactFlow
               nodes={nodes}
               edges={edges}
               onNodesChange={onNodesChange}
               onEdgesChange={onEdgesChange}
               onConnect={onConnect}
               onDrop={onDrop}
               onDragOver={onDragOver}
               nodeTypes={nodeTypes}
               fitView
               attributionPosition="bottom-right"
               className="bg-slate-50 dark:bg-slate-900"
            >
               <Background color={theme === 'dark' ? '#475569' : '#cbd5e1'} gap={20} size={1} />
               <Controls className="!bg-white dark:!bg-slate-700 !border-gray-200 dark:!border-slate-600 !shadow-lg text-gray-600 dark:text-gray-300" />
               <MiniMap 
                  nodeStrokeColor={(n) => {
                     if (n.type === 'trigger') return '#22c55e';
                     if (n.type === 'action') return '#3b82f6';
                     if (n.type === 'condition') return '#eab308';
                     if (n.type === 'ai') return '#a855f7';
                     return '#64748b';
                  }}
                  nodeColor={(n) => {
                     return theme === 'dark' ? '#1e293b' : '#fff';
                  }}
                  className="!bg-white dark:!bg-slate-800 !border-gray-200 dark:!border-slate-700 !shadow-lg rounded-lg overflow-hidden" 
               />
            </ReactFlow>
            
            {/* Overlay hint if empty */}
            {nodes.length === 0 && (
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center text-gray-400">
                     <div className="w-16 h-16 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                        <Plus size={32} />
                     </div>
                     <p className="font-medium">Drag nodes here to build</p>
                  </div>
               </div>
            )}
         </div>

         {/* Config Panel (Placeholder) */}
         <div className="w-80 bg-white dark:bg-slate-800 border-l border-gray-200 dark:border-slate-700 hidden xl:flex flex-col z-10">
            <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
               <h3 className="font-bold text-sm text-navy-900 dark:text-white">Configuration</h3>
               <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <Settings size={16} />
               </button>
            </div>
            <div className="flex-1 p-8 flex flex-col items-center justify-center text-gray-400 text-center">
               <p className="text-sm">Select a node on the canvas to configure its properties.</p>
            </div>
         </div>
      </div>
    </div>
  );
};

// Helper Component for Sidebar Items
const DraggableNode = ({ type, label, n8nType, icon: Icon, color }: any) => {
   const onDragStart = (event: React.DragEvent, nodeType: string, nodeLabel: string, n8nTypeStr: string) => {
     event.dataTransfer.setData('application/reactflow', nodeType);
     event.dataTransfer.setData('application/label', nodeLabel);
     event.dataTransfer.setData('application/n8nType', n8nTypeStr);
     event.dataTransfer.effectAllowed = 'move';
   };
 
   return (
     <div 
       className={`
         flex items-center gap-3 p-3 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg 
         cursor-grab hover:border-${color}-400 dark:hover:border-${color}-400 hover:shadow-md transition-all group
       `}
       draggable
       onDragStart={(event) => onDragStart(event, type, label, n8nType)}
     >
       <div className={`p-1.5 rounded bg-${color}-50 dark:bg-${color}-900/20 text-${color}-600 dark:text-${color}-400 group-hover:bg-${color}-100 dark:group-hover:bg-${color}-900/40 transition-colors`}>
          <Icon size={16} />
       </div>
       <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{label}</span>
     </div>
   );
 };

const WorkflowBuilder = (props: WorkflowBuilderProps) => {
   return (
      <ReactFlowProvider>
         <WorkflowBuilderContent {...props} />
      </ReactFlowProvider>
   );
}

export default WorkflowBuilder;
