
import { create } from 'zustand';
import { 
  Connection, 
  Edge, 
  EdgeChange, 
  Node, 
  NodeChange, 
  addEdge, 
  OnNodesChange, 
  OnEdgesChange, 
  OnConnect,
  applyNodeChanges,
  applyEdgeChanges
} from 'reactflow';
import { n8nApi } from '../services/n8nApi';

// Define the Node Data Interface
export interface WorkflowNodeData {
  label: string;
  type: 'trigger' | 'action' | 'condition' | 'ai';
  icon?: string;
  description?: string;
  // n8n specific settings
  parameters?: Record<string, any>;
  nodeType?: string; // e.g. 'n8n-nodes-base.webhook'
}

interface WorkflowState {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  workflowId: string | null;
  workflowName: string;
  isActive: boolean;
  isLoading: boolean;
  isDirty: boolean;
  
  // Actions
  setWorkflow: (id: string, name: string, active: boolean, nodes: Node[], edges: Edge[]) => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (node: Node<WorkflowNodeData>) => void;
  updateNodeData: (id: string, data: Partial<WorkflowNodeData>) => void;
  
  // Async Actions
  fetchWorkflow: (id: string) => Promise<void>;
  saveWorkflow: () => Promise<void>;
  createWorkflow: (name: string) => Promise<string>;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  workflowId: null,
  workflowName: 'Untitled Workflow',
  isActive: false,
  isLoading: false,
  isDirty: false,

  setWorkflow: (id, name, active, nodes, edges) => set({ 
    workflowId: id, 
    workflowName: name, 
    isActive: active,
    nodes, 
    edges,
    isDirty: false 
  }),

  onNodesChange: (changes: NodeChange[]) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
      isDirty: true,
    });
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
      isDirty: true,
    });
  },

  onConnect: (connection: Connection) => {
    set({
      edges: addEdge(connection, get().edges),
      isDirty: true,
    });
  },

  addNode: (node: Node<WorkflowNodeData>) => {
    set({
      nodes: [...get().nodes, node],
      isDirty: true,
    });
  },

  updateNodeData: (id: string, data: Partial<WorkflowNodeData>) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, ...data } };
        }
        return node;
      }),
      isDirty: true,
    });
  },

  fetchWorkflow: async (id: string) => {
    set({ isLoading: true });
    try {
      const wf = await n8nApi.getWorkflow(id);
      
      // Basic Conversion Logic (n8n -> ReactFlow)
      // This is a simplified mapping. In production, you'd need a robust mapper for all n8n node types.
      const rfNodes: Node[] = wf.nodes.map((n: any) => ({
        id: n.name,
        type: determineNodeType(n.type),
        position: { x: n.position[0], y: n.position[1] },
        data: {
          label: n.name,
          type: determineNodeType(n.type) as any,
          nodeType: n.type,
          parameters: n.parameters,
        }
      }));

      const rfEdges: Edge[] = [];
      Object.keys(wf.connections).forEach(sourceNode => {
        const outputs = wf.connections[sourceNode]; // main, etc.
        if (outputs.main) {
           outputs.main.forEach((targets: any[]) => {
              targets.forEach((target: any) => {
                 rfEdges.push({
                   id: `e-${sourceNode}-${target.node}`,
                   source: sourceNode,
                   target: target.node,
                   type: 'smoothstep'
                 });
              });
           });
        }
      });

      set({ 
        workflowId: wf.id, 
        workflowName: wf.name, 
        isActive: wf.active,
        nodes: rfNodes, 
        edges: rfEdges, 
        isDirty: false 
      });
    } catch (e) {
      console.error(e);
    } finally {
      set({ isLoading: false });
    }
  },

  saveWorkflow: async () => {
    const { workflowId, nodes, edges, workflowName } = get();
    if (!workflowId) return;

    set({ isLoading: true });

    // Conversion Logic (ReactFlow -> n8n)
    const n8nNodes = nodes.map(n => ({
      parameters: n.data.parameters || {},
      name: n.data.label, // n8n uses name as ID effectively
      type: n.data.nodeType || 'n8n-nodes-base.noOp', // Fallback
      typeVersion: 1,
      position: [n.position.x, n.position.y]
    }));

    const n8nConnections: any = {};
    edges.forEach(e => {
       // Assuming simplistic main input/output for now
       if (!n8nConnections[e.source]) {
         n8nConnections[e.source] = { main: [] };
       }
       // n8n expects array of arrays [[{node: 'NextNode', type: 'main', index: 0}]]
       // We'll simplify and assume index 0
       let foundGroup = false;
       for(let group of n8nConnections[e.source].main) {
          // This logic is simplified; n8n connection structure is complex
          // For now, we push to the first output group
          group.push({ node: e.target, type: 'main', index: 0 });
          foundGroup = true;
          break;
       }
       if (!foundGroup) {
          n8nConnections[e.source].main.push([{ node: e.target, type: 'main', index: 0 }]);
       }
    });

    try {
      await n8nApi.updateWorkflow(workflowId, {
        name: workflowName,
        nodes: n8nNodes,
        connections: n8nConnections
      });
      set({ isDirty: false });
    } catch (e) {
      console.error(e);
      alert("Failed to save to n8n (Check console - CORS might block direct browser calls)");
    } finally {
      set({ isLoading: false });
    }
  },

  createWorkflow: async (name: string) => {
    set({ isLoading: true });
    try {
       const wf = await n8nApi.createWorkflow(name);
       set({ workflowId: wf.id, workflowName: wf.name, nodes: [], edges: [], isDirty: false });
       return wf.id;
    } catch (e) {
       console.error(e);
       // Mock for demo
       const mockId = `new-${Date.now()}`;
       set({ workflowId: mockId, workflowName: name, nodes: [], edges: [], isDirty: false });
       return mockId;
    } finally {
       set({ isLoading: false });
    }
  }
}));

// Helper
function determineNodeType(n8nType: string): 'trigger' | 'action' | 'condition' | 'ai' {
  if (n8nType.includes('webhook') || n8nType.includes('trigger') || n8nType.includes('cron')) return 'trigger';
  if (n8nType.includes('if') || n8nType.includes('switch') || n8nType.includes('merge')) return 'condition';
  if (n8nType.includes('openai') || n8nType.includes('claude') || n8nType.includes('ai')) return 'ai';
  return 'action';
}
