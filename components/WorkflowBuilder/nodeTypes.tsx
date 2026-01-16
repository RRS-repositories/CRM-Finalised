
import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { 
  Zap, 
  Play, 
  GitBranch, 
  BrainCircuit, 
  Mail, 
  MessageSquare, 
  Database,
  Globe,
  Clock,
  MoreVertical
} from 'lucide-react';
import { WorkflowNodeData } from '../../stores/workflowStore';

// Base Node Component
const BaseNode = ({ data, selected, children, colorClass, icon: Icon }: any) => {
  return (
    <div className={`
      relative min-w-[180px] bg-white dark:bg-slate-800 rounded-xl shadow-lg border-2 transition-all duration-200
      ${selected ? `border-${colorClass}-500 ring-2 ring-${colorClass}-200 dark:ring-${colorClass}-900` : 'border-transparent hover:border-gray-200 dark:hover:border-slate-600'}
    `}>
      {/* Header */}
      <div className={`
        flex items-center gap-2 px-3 py-2 rounded-t-xl border-b border-gray-100 dark:border-slate-700
        ${selected ? `bg-${colorClass}-50 dark:bg-${colorClass}-900/20` : 'bg-white dark:bg-slate-800'}
      `}>
        <div className={`p-1.5 rounded-lg bg-${colorClass}-100 dark:bg-${colorClass}-900/40 text-${colorClass}-600 dark:text-${colorClass}-400`}>
          <Icon size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">{data.label}</p>
          <p className="text-[10px] text-gray-400 truncate capitalize">{data.type}</p>
        </div>
        <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
           <MoreVertical size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="p-3 text-xs text-gray-500 dark:text-gray-400">
        {children || <p className="italic opacity-50">No configuration</p>}
      </div>

      {/* Handles */}
      <Handle type="target" position={Position.Left} className="w-3 h-3 border-2 border-white dark:border-slate-800 bg-gray-400 !-left-1.5" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 border-2 border-white dark:border-slate-800 bg-gray-400 !-right-1.5" />
    </div>
  );
};

export const TriggerNode: React.FC<NodeProps<WorkflowNodeData>> = (props) => {
  return (
    <BaseNode {...props} colorClass="green" icon={Zap}>
       <div className="flex flex-col gap-1">
          {props.data.parameters?.path && <code className="bg-gray-100 dark:bg-slate-700 px-1 py-0.5 rounded text-[10px]">{props.data.parameters.path}</code>}
          <span className="text-[10px]">Starts workflow execution</span>
       </div>
    </BaseNode>
  );
};

export const ActionNode: React.FC<NodeProps<WorkflowNodeData>> = (props) => {
  let Icon = Database;
  if (props.data.label.toLowerCase().includes('email')) Icon = Mail;
  if (props.data.label.toLowerCase().includes('sms')) Icon = MessageSquare;
  if (props.data.label.toLowerCase().includes('http')) Icon = Globe;

  return (
    <BaseNode {...props} colorClass="blue" icon={Icon}>
       <div className="text-[10px]">
          {props.data.description || "Executes an action"}
       </div>
    </BaseNode>
  );
};

export const ConditionNode: React.FC<NodeProps<WorkflowNodeData>> = (props) => {
  return (
    <BaseNode {...props} colorClass="yellow" icon={GitBranch}>
       <div className="flex justify-between text-[10px] font-medium text-gray-500 dark:text-gray-400 mt-1">
          <span>True</span>
          <span>False</span>
       </div>
    </BaseNode>
  );
};

export const AINode: React.FC<NodeProps<WorkflowNodeData>> = (props) => {
  return (
    <BaseNode {...props} colorClass="purple" icon={BrainCircuit}>
       <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 p-2 rounded text-[10px] text-purple-700 dark:text-purple-300">
          AI Analysis & Generation
       </div>
    </BaseNode>
  );
};

export const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  ai: AINode,
};
