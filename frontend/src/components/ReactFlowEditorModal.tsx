import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  ReactFlow, 
  Controls, 
  Background, 
  useNodesState, 
  useEdgesState, 
  addEdge,
  Connection,
  Edge,
  Node,
  Panel,
  MarkerType,
  Handle,
  Position,
  NodeToolbar,
  useReactFlow,
  ReactFlowProvider,
  EdgeProps,
  getSmoothStepPath,
  BaseEdge,
  EdgeLabelRenderer
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { 
  X, Play, RefreshCw, LayoutGrid, Plus, Save, Trash2, Edit3, 
  Settings, CheckCircle2, GitFork, Copy, HelpCircle, Layers 
} from 'lucide-react';
import dagre from 'dagre';

// --- Dagre Auto-layout Helper ---
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  // Set layout direction (TB = Top to Bottom, LR = Left to Right)
  dagreGraph.setGraph({ 
    rankdir: direction,
    nodesep: 60,
    ranksep: 100,
    marginx: 50,
    marginy: 50
  });

  nodes.forEach((node) => {
    // Estimations of node sizes for alignment calculation
    let width = 160;
    let height = 60;
    if (node.data?.type === 'decision') {
      width = 100;
      height = 100;
    }
    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    let width = 160;
    let height = 60;
    if (node.data?.type === 'decision') {
      width = 100;
      height = 100;
    }

    return {
      ...node,
      position: {
        // Adjust back to top-left from center
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

// --- Custom Modern Node Design ---
const CustomNode = ({ data, selected, id }: any) => {
  const { setNodes, setEdges } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(data.label || '');

  const type = data.type || 'process';
  
  // Theme styling configurations based on node type
  let borderStyle = '1px solid rgba(255,255,255,0.15)';
  let bgStyle = 'rgba(15, 23, 42, 0.9)'; // Slate 900 Glassmorphic
  let accentColor = '#8C6239'; // Default gold accent
  let IconComponent = Settings;
  let labelType = 'Tiến trình';

  if (type === 'input') {
    accentColor = '#10B981'; // Green
    bgStyle = 'rgba(16, 185, 129, 0.08)';
    borderStyle = `1px solid ${accentColor}`;
    IconComponent = Play;
    labelType = 'Đầu vào';
  } else if (type === 'decision') {
    accentColor = '#FF9100'; // Amber
    bgStyle = 'rgba(255, 145, 0, 0.08)';
    borderStyle = `1px solid ${accentColor}`;
    IconComponent = GitFork;
    labelType = 'Quyết định';
  } else if (type === 'output') {
    accentColor = '#3b82f6'; // Blue
    bgStyle = 'rgba(59, 130, 246, 0.08)';
    borderStyle = `1px solid ${accentColor}`;
    IconComponent = CheckCircle2;
    labelType = 'Kết quả';
  } else {
    IconComponent = Layers;
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditLabel(data.label || '');
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (editLabel.trim() && editLabel !== data.label) {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label: editLabel } } : n))
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes((nds) => {
      const nodeToDup = nds.find((n) => n.id === id);
      if (!nodeToDup) return nds;
      const newId = `node-${Math.random().toString(36).substring(2, 9)}`;
      const newNode = {
        ...nodeToDup,
        id: newId,
        position: {
          x: nodeToDup.position.x + 40,
          y: nodeToDup.position.y + 40,
        },
        selected: false,
      };
      return [...nds, newNode];
    });
  };

  // Base layout styles
  const baseNodeStyle: React.CSSProperties = {
    padding: '12px 18px',
    background: bgStyle,
    color: '#f8fafc',
    fontSize: '13px',
    fontWeight: 'bold',
    minWidth: '160px',
    maxWidth: '220px',
    textAlign: 'center',
    boxShadow: selected ? `0 0 16px ${accentColor}88` : '0 4px 12px rgba(0, 0, 0, 0.4)',
    transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
    position: 'relative',
    backdropFilter: 'blur(12px)',
  };

  // Render Decision Node as a beautiful diamond shape
  if (type === 'decision') {
    return (
      <div style={{
        width: '110px',
        height: '110px',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f8fafc',
        fontSize: '12px',
        fontWeight: 'bold',
        transition: 'all 0.15s ease',
      }}>
        {/* Rotated Diamond Background */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: bgStyle,
          border: selected ? `2.5px solid ${accentColor}` : borderStyle,
          borderRadius: '8px',
          transform: 'rotate(45deg)',
          boxShadow: selected ? `0 0 16px ${accentColor}88` : '0 4px 12px rgba(0, 0, 0, 0.4)',
          zIndex: 1,
          transition: 'all 0.15s ease',
        }} />
        
        {/* Handles exactly on the diamond points (not rotated) */}
        <Handle type="target" position={Position.Top} id="t-top" style={{ background: accentColor, zIndex: 10, width: '8px', height: '8px', border: '2px solid #0B132B' }} />
        <Handle type="target" position={Position.Left} id="t-left" style={{ background: accentColor, zIndex: 10, width: '8px', height: '8px', border: '2px solid #0B132B' }} />
        <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ background: accentColor, zIndex: 10, width: '8px', height: '8px', border: '2px solid #0B132B' }} />
        <Handle type="source" position={Position.Right} id="s-right" style={{ background: accentColor, zIndex: 10, width: '8px', height: '8px', border: '2px solid #0B132B' }} />

        {/* Upright Text Container */}
        <div style={{
          position: 'relative',
          zIndex: 2,
          padding: '8px',
          textAlign: 'center',
          maxWidth: '85px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
        }} onDoubleClick={handleDoubleClick}>
          {selected && (
            <NodeToolbar position={Position.Top} style={{ display: 'flex', gap: '6px', background: '#1c2541', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 20 }}>
              <button onClick={handleDuplicate} style={{ background: '#8C6239', border: 'none', borderRadius: '4px', color: '#fff', padding: '3px 6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>X2</button>
              <button onClick={handleDelete} style={{ background: '#ef4444', border: 'none', borderRadius: '4px', color: '#fff', padding: '3px 6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>Xóa</button>
            </NodeToolbar>
          )}
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', textTransform: 'uppercase', color: accentColor, letterSpacing: '0.5px' }}>
            <IconComponent size={10} />
            <span>{labelType}</span>
          </div>

          {isEditing ? (
            <input
              type="text"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              autoFocus
              style={{
                background: 'rgba(0,0,0,0.6)',
                border: `1px solid ${accentColor}`,
                borderRadius: '4px',
                color: '#fff',
                fontSize: '11px',
                padding: '2px 4px',
                width: '80px',
                textAlign: 'center',
                outline: 'none',
              }}
            />
          ) : (
            <div style={{ whiteSpace: 'normal', wordBreak: 'break-word', userSelect: 'none', fontSize: '12px', lineHeight: '1.2' }}>
              {data.label}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Oval shape for Input/Output Nodes, Rounded Rectangle for Process Node
  const nodeStyle: React.CSSProperties = {
    ...baseNodeStyle,
    borderRadius: (type === 'input' || type === 'output') ? '24px' : '8px',
    border: selected ? `2.5px solid ${accentColor}` : borderStyle,
    borderLeft: selected ? `2.5px solid ${accentColor}` : `5px solid ${accentColor}`,
  };

  return (
    <div style={nodeStyle}>
      <Handle type="target" position={Position.Top} id="t-top" style={{ background: accentColor, width: '8px', height: '8px', border: '2px solid #0B132B' }} />
      <Handle type="target" position={Position.Left} id="t-left" style={{ background: accentColor, width: '8px', height: '8px', border: '2px solid #0B132B' }} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ background: accentColor, width: '8px', height: '8px', border: '2px solid #0B132B' }} />
      <Handle type="source" position={Position.Right} id="s-right" style={{ background: accentColor, width: '8px', height: '8px', border: '2px solid #0B132B' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onDoubleClick={handleDoubleClick}>
        {selected && (
          <NodeToolbar position={Position.Top} style={{ display: 'flex', gap: '6px', background: '#1c2541', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 20 }}>
            <button onClick={handleDuplicate} style={{ background: '#8C6239', border: 'none', borderRadius: '4px', color: '#fff', padding: '3px 6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>X2</button>
            <button onClick={handleDelete} style={{ background: '#ef4444', border: 'none', borderRadius: '4px', color: '#fff', padding: '3px 6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>Xóa</button>
          </NodeToolbar>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '9px', textTransform: 'uppercase', color: accentColor, letterSpacing: '0.5px' }}>
          <IconComponent size={10} />
          <span>{labelType}</span>
        </div>

        {isEditing ? (
          <input
            type="text"
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoFocus
            style={{
              background: 'rgba(0,0,0,0.6)',
              border: `1px solid ${accentColor}`,
              borderRadius: '4px',
              color: '#fff',
              fontSize: '12px',
              padding: '2px 4px',
              width: '100%',
              textAlign: 'center',
              outline: 'none',
            }}
          />
        ) : (
          <div style={{ whiteSpace: 'normal', wordBreak: 'break-word', userSelect: 'none', fontSize: '13px', lineHeight: '1.3' }}>
            {data.label}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Custom Editable Edge Design ---
const EditableEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
  selected
}: EdgeProps) => {
  const { setEdges } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState((label as string) || '');

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditLabel((label as string) || '');
  };

  const handleBlur = () => {
    setIsEditing(false);
    setEdges((eds) =>
      eds.map((e) => (e.id === id ? { ...e, label: editLabel } : e))
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEdges((eds) => eds.filter((e) => e.id !== id));
  };

  return (
    <>
      <BaseEdge 
        path={edgePath} 
        markerEnd={markerEnd} 
        style={{
          ...style,
          stroke: selected ? '#3b82f6' : (style.stroke || '#8C6239'),
          strokeWidth: selected ? 3.5 : (style.strokeWidth || 2),
          transition: 'stroke 0.15s, stroke-width 0.15s',
        }} 
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            zIndex: 1000,
          }}
          className="nodrag nopan"
        >
          {isEditing ? (
            <input
              type="text"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              autoFocus
              style={{
                background: '#1C2541',
                border: '1px solid #8C6239',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '11px',
                padding: '2px 6px',
                width: '70px',
                textAlign: 'center',
                outline: 'none',
              }}
            />
          ) : (
            <div
              onDoubleClick={handleDoubleClick}
              style={{
                background: '#0B132B',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '4px',
                padding: '2px 8px',
                color: '#f8fafc',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                userSelect: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{label || 'Sửa'}</span>
              {selected && (
                <button
                  onClick={handleDelete}
                  style={{
                    background: '#ef4444',
                    border: 'none',
                    borderRadius: '50%',
                    width: '12px',
                    height: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '8px',
                    cursor: 'pointer',
                    padding: 0,
                    lineHeight: 1,
                  }}
                  title="Xóa liên kết"
                >
                  ×
                </button>
              )}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

// --- Main Interactive Canvas Component ---
interface FlowEditorProps {
  mermaidCode: string;
  slideMarkdown?: string;
  savedLayout: string | null;
  onSave: (layoutJson: string) => void;
  onClose: () => void;
}

function ReactFlowEditor({
  mermaidCode,
  slideMarkdown,
  savedLayout,
  onSave,
  onClose
}: FlowEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
  const [tourStep, setTourStep] = useState<number | null>(null);

  const reactFlowInstance = useReactFlow();

  const getSlideTextContent = (md: string) => {
    // Remove mermaid code blocks
    let clean = md.replace(/```mermaid[\s\S]*?```/g, '');
    clean = clean.replace(/```[\s\S]*?```/g, ''); // Remove other code blocks
    // Clean up slide heading tags
    clean = clean.replace(/##?/g, '');
    return clean.trim();
  };

  const renderSlideReference = () => {
    if (!slideMarkdown) return null;
    const cleanText = getSlideTextContent(slideMarkdown);
    if (!cleanText) return null;

    return (
      <div style={{
        width: '280px',
        background: 'rgba(11, 19, 43, 0.95)',
        borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '20px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        overflowY: 'auto',
        zIndex: 10,
      }}
      className="flow-sidebar-reference"
      >
        <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Edit3 size={15} style={{ color: '#8C6239' }} /> Nội dung Slide gốc
        </h4>
        <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: '1.4' }}>
          Tra cứu thông tin slide để đặt tên nhãn chính xác cho các khối A, B, C, D...
        </p>

        <div style={{
          background: 'rgba(0, 0, 0, 0.25)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          padding: '12px',
          color: '#e2e8f0',
          fontSize: '12px',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: 'inherit',
          flex: 1,
          overflowY: 'auto',
        }}>
          {cleanText}
        </div>
      </div>
    );
  };
  const nodeTypes = useMemo(() => ({
    custom: CustomNode,
  }), []);

  const edgeTypes = useMemo(() => ({
    editable: EditableEdge,
  }), []);

  // Parse Mermaid code
  const parseMermaidToFlow = useCallback((code: string): { nodes: Node[]; edges: Edge[] } => {
    const parsedNodes: Node[] = [];
    const parsedEdges: Edge[] = [];
    const lines = code.split('\n');

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('graph') || trimmed.startsWith('flowchart')) return;

      // 1. Extract all node labels and shapes from the line
      let match;
      
      // Rect node: ID[Label]
      const rectRegex = /([A-Za-z0-9_-]+)\[(.*?)\]/g;
      while ((match = rectRegex.exec(trimmed)) !== null) {
        const id = match[1].trim();
        const label = match[2].trim();
        if (!parsedNodes.some(n => n.id === id)) {
          parsedNodes.push({
            id,
            type: 'custom',
            position: { x: 0, y: 0 },
            data: { label, type: 'process' }
          });
        } else {
          const existing = parsedNodes.find(n => n.id === id);
          if (existing) {
            existing.data = { ...existing.data, label };
          }
        }
      }

      // Round node (Input/Output): ID(Label)
      const roundRegex = /([A-Za-z0-9_-]+)\((.*?)\)/g;
      while ((match = roundRegex.exec(trimmed)) !== null) {
        const id = match[1].trim();
        const label = match[2].trim();
        const isOutput = id.toLowerCase().includes('out') || id.toLowerCase().includes('end') || id.toLowerCase().includes('ketqua');
        const nodeType = isOutput ? 'output' : 'input';
        if (!parsedNodes.some(n => n.id === id)) {
          parsedNodes.push({
            id,
            type: 'custom',
            position: { x: 0, y: 0 },
            data: { label, type: nodeType }
          });
        } else {
          const existing = parsedNodes.find(n => n.id === id);
          if (existing) {
            existing.data = { ...existing.data, label, type: nodeType };
          }
        }
      }

      // Decision node: ID{Label}
      const decisionRegex = /([A-Za-z0-9_-]+)\{(.*?)\}/g;
      while ((match = decisionRegex.exec(trimmed)) !== null) {
        const id = match[1].trim();
        const label = match[2].trim();
        if (!parsedNodes.some(n => n.id === id)) {
          parsedNodes.push({
            id,
            type: 'custom',
            position: { x: 0, y: 0 },
            data: { label, type: 'decision' }
          });
        } else {
          const existing = parsedNodes.find(n => n.id === id);
          if (existing) {
            existing.data = { ...existing.data, label, type: 'decision' };
          }
        }
      }

      // 2. Clean the line of labels to leave only connection codes (e.g. "A[Label] --> B" -> "A --> B")
      let cleanLine = trimmed;
      cleanLine = cleanLine.replace(/([A-Za-z0-9_-]+)\[.*?\]/g, '$1');
      cleanLine = cleanLine.replace(/([A-Za-z0-9_-]+)\(.*?\)/g, '$1');
      cleanLine = cleanLine.replace(/([A-Za-z0-9_-]+)\{.*?\}/g, '$1');

      // 3. Extract edges/connections from the cleaned line
      const edgeReg = /([A-Za-z0-9_-]+)\s*-->\s*(?:\|(.*?)\|\s*)?([A-Za-z0-9_-]+)/;
      const edgeMatch = cleanLine.match(edgeReg);
      if (edgeMatch) {
        const source = edgeMatch[1].trim();
        const label = edgeMatch[2] ? edgeMatch[2].trim() : undefined;
        const target = edgeMatch[3].trim();

        // Create placeholders if nodes don't exist yet
        [source, target].forEach((nodeId, idx) => {
          if (!parsedNodes.some(n => n.id === nodeId)) {
            const isDecision = nodeId.toLowerCase().includes('dec') || nodeId.toLowerCase().includes('choice');
            parsedNodes.push({
              id: nodeId,
              type: 'custom',
              position: { x: 0, y: 0 },
              data: { 
                label: nodeId, 
                type: isDecision ? 'decision' : (idx === 0 ? 'input' : 'process') 
              },
            });
          }
        });

        const edgeId = `e-${source}-${target}-${Math.random().toString(36).substring(2, 6)}`;
        parsedEdges.push({
          id: edgeId,
          source,
          target,
          label,
          type: 'editable',
          markerEnd: { type: MarkerType.ArrowClosed, color: '#8C6239' },
          style: { stroke: '#8C6239', strokeWidth: 2 },
        });
      }
    });

    // Auto-spacing placement for nodes if not structured (layouted by Dagre TB on load anyway)
    parsedNodes.forEach((node, index) => {
      node.position = {
        x: (index % 3) * 220 + 100,
        y: Math.floor(index / 3) * 150 + 80
      };
    });

    return { nodes: parsedNodes, edges: parsedEdges };
  }, []);

  // Initialize nodes and edges
  useEffect(() => {
    // Check localStorage for temporary autosaved layout
    const tempKey = `temp_flow_layout_${mermaidCode.substring(0, 30)}`;
    const temp = localStorage.getItem(tempKey);
    if (temp) {
      try {
        const parsed = JSON.parse(temp);
        if (parsed.nodes && parsed.edges) {
          setNodes(parsed.nodes);
          setEdges(parsed.edges);
          return;
        }
      } catch (e) {
        console.error("Error parsing temp layout:", e);
      }
    }

    if (savedLayout) {
      try {
        const parsed = JSON.parse(savedLayout);
        if (parsed.nodes && parsed.edges) {
          setNodes(parsed.nodes);
          setEdges(parsed.edges);
          return;
        }
      } catch (e) {
        console.error("Error parsing saved layout:", e);
      }
    }

    // Fallback: parse from Mermaid and align with Dagre
    const initial = parseMermaidToFlow(mermaidCode);
    const layouted = getLayoutedElements(initial.nodes, initial.edges, 'TB');
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [mermaidCode, savedLayout, parseMermaidToFlow, setNodes, setEdges]);

  // Connect two nodes
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({
      ...params,
      type: 'editable',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#8C6239' },
      style: { stroke: '#8C6239', strokeWidth: 2 }
    } as any, eds)),
    [setEdges]
  );

  // Auto-layout triggering function
  const onLayout = useCallback((direction: string) => {
    const layouted = getLayoutedElements(nodes, edges, direction);
    setNodes([...layouted.nodes]);
    setEdges([...layouted.edges]);
    setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.15 });
    }, 100);
  }, [nodes, edges, reactFlowInstance, setNodes, setEdges]);

  // Drag and drop event handlers
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (typeof type === 'undefined' || !type) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const labelMap: Record<string, string> = {
        input: 'Đầu vào mới',
        process: 'Tiến trình mới',
        decision: 'Quyết định mới',
        output: 'Kết quả mới',
      };

      const newNode: Node = {
        id: `node-${Math.random().toString(36).substring(2, 9)}`,
        type: 'custom',
        position,
        data: { label: labelMap[type] || 'Khối mới', type },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [reactFlowInstance, setNodes]
  );

  // Quick click insert
  const handleQuickAddNode = (type: string) => {
    const labelMap: Record<string, string> = {
      input: 'Đầu vào mới',
      process: 'Tiến trình mới',
      decision: 'Quyết định mới',
      output: 'Kết quả mới',
    };

    const viewport = reactFlowInstance.getViewport();
    // Insert into viewport center
    const x = -viewport.x / viewport.zoom + (window.innerWidth / 2 - 280) / viewport.zoom;
    const y = -viewport.y / viewport.zoom + (window.innerHeight / 2 - 120) / viewport.zoom;

    const newNode: Node = {
      id: `node-${Math.random().toString(36).substring(2, 9)}`,
      type: 'custom',
      position: { x, y },
      data: { label: labelMap[type] || 'Khối mới', type },
    };

    setNodes((nds) => [...nds, newNode]);
  };

  // Reset to original layout
  const handleResetLayout = () => {
    if (window.confirm("Bạn có chắc muốn khôi phục bố cục gốc từ sơ đồ Mermaid? Các chỉnh sửa vị trí sẽ bị xóa.")) {
      const initial = parseMermaidToFlow(mermaidCode);
      const layouted = getLayoutedElements(initial.nodes, initial.edges, 'TB');
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
      reactFlowInstance.fitView({ padding: 0.15 });
    }
  };

  // Manual save layout
  const handleSave = () => {
    const layout = { nodes, edges };
    onSave(JSON.stringify(layout));
    
    // Clear autosave key
    const tempKey = `temp_flow_layout_${mermaidCode.substring(0, 30)}`;
    localStorage.removeItem(tempKey);
    onClose();
  };

  // Autosave execution
  useEffect(() => {
    if (nodes.length === 0) return;

    setSaveStatus('saving');
    const timer = setTimeout(() => {
      try {
        const layout = { nodes, edges };
        const tempKey = `temp_flow_layout_${mermaidCode.substring(0, 30)}`;
        localStorage.setItem(tempKey, JSON.stringify(layout));
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (e) {
        console.error("Autosave error:", e);
        setSaveStatus('idle');
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [nodes, edges, mermaidCode]);

  // Handle tour popup on first load
  useEffect(() => {
    const hasCompleted = localStorage.getItem('flow_tour_completed');
    if (!hasCompleted) {
      setTourStep(0);
    }
  }, []);

  // Render Walkthrough Tour Steps with Dynamic Element Detection
  const renderTour = () => {
    if (tourStep === null) return null;

    const tourSteps = [
      {
        title: "Bộ biên tập sơ đồ trực quan! 👋",
        content: "Công cụ này giúp bạn thiết kế quy trình dưới dạng flowchart trực quan sinh động và tự động chèn vào slide bài giảng dưới dạng ảnh sắc nét.",
        position: 'center',
        selector: '',
      },
      {
        title: "Thư viện Khối sơ đồ 🛠️",
        content: "Kéo thả các khối như Đầu vào, Quyết định, Tiến trình, Kết quả từ Sidebar trái vào màn hình để thêm khối mới, hoặc click trực tiếp để thêm nhanh vào tâm.",
        position: 'left-sidebar',
        selector: '.flow-sidebar-palette',
      },
      {
        title: "Kéo nối để vẽ liên kết 🔗",
        content: "Rê chuột vào một khối để xuất hiện các chấm tròn nhỏ (Handles) ở các cạnh. Kéo chuột từ chấm này sang chấm của khối khác để vẽ mũi tên chỉ hướng đi.",
        position: 'canvas',
        selector: '.react-flow__pane',
      },
      {
        title: "Kích đúp sửa nhãn tại chỗ ✍️",
        content: "Nhấp đúp chuột trực tiếp vào bất kỳ khối nào hoặc nhấp đúp vào nhãn chữ ở giữa mũi tên để sửa nội dung chữ cực kỳ nhanh chóng.",
        position: 'canvas',
        selector: '.react-flow__pane',
      },
      {
        title: "Hoàn tất & Căn chỉnh tự động 🚀",
        content: "Bấm nút 'Sắp xếp dọc' hoặc 'Sắp xếp ngang' ở thanh công cụ trên cùng để căn thẳng hàng tự động siêu đẹp. Xong việc, bấm 'Lưu bố cục'!",
        position: 'top-bar',
        selector: '.flow-top-toolbar',
      }
    ];

    const currentStep = tourSteps[tourStep];

    const handleNext = () => {
      if (tourStep < tourSteps.length - 1) {
        setTourStep(tourStep + 1);
      } else {
        handleEndTour();
      }
    };

    const handlePrev = () => {
      if (tourStep > 0) {
        setTourStep(tourStep - 1);
      }
    };

    const handleEndTour = () => {
      setTourStep(null);
      localStorage.setItem('flow_tour_completed', 'true');
    };

    // Dynamic position logic
    let highlightStyle: React.CSSProperties = {};
    let popoverStyle: React.CSSProperties = {
      position: 'fixed',
      background: '#1C2541',
      border: '2px solid #8C6239',
      borderRadius: '12px',
      padding: '24px',
      color: '#fff',
      width: '320px',
      boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
      zIndex: 10005,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      transition: 'all 0.3s ease',
    };

    // Fetch live element bounding rect
    const el = currentStep.selector ? document.querySelector(currentStep.selector) : null;
    const rect = el ? el.getBoundingClientRect() : null;

    if (currentStep.position === 'center' || !rect) {
      popoverStyle = {
        ...popoverStyle,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '400px',
      };
    } else {
      // Set highlight border wrapping target bounds
      highlightStyle = {
        position: 'fixed',
        top: rect.top - 8,
        left: rect.left - 8,
        width: rect.width + 16,
        height: rect.height + 16,
        boxShadow: '0 0 0 9999px rgba(7, 10, 19, 0.75)',
        border: '3px solid #8C6239',
        borderRadius: '12px',
        pointerEvents: 'none',
        zIndex: 10000,
        transition: 'all 0.2s ease',
      };

      // Set popover location relative to target rect
      if (currentStep.position === 'left-sidebar') {
        popoverStyle = {
          ...popoverStyle,
          top: Math.max(120, rect.top + 20),
          left: rect.right + 24,
        };
      } else if (currentStep.position === 'top-bar') {
        popoverStyle = {
          ...popoverStyle,
          top: rect.bottom + 20,
          left: Math.max(40, rect.left + (rect.width / 2) - 160),
        };
      } else if (currentStep.position === 'canvas') {
        // Canvas: show floating bottom center
        popoverStyle = {
          ...popoverStyle,
          bottom: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '450px',
        };
      }
    }

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10000,
        pointerEvents: 'auto',
      }}>
        {/* Backdrop for clickout/dimming */}
        {(currentStep.position === 'center' || !rect) && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(7, 10, 19, 0.8)',
            zIndex: 9999,
          }} onClick={handleEndTour} />
        )}

        {/* Dynamic Highlight overlay */}
        {currentStep.position !== 'center' && rect && (
          <div style={highlightStyle} />
        )}

        {/* Prevent accidental interface clicks during tour */}
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10001,
          pointerEvents: 'auto',
          background: 'transparent',
        }} />

        {/* Tour dialog card */}
        <div style={popoverStyle}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#8C6239', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}>
            {currentStep.title}
          </h3>
          <p style={{ margin: 0, fontSize: '12.5px', color: '#e2e8f0', lineHeight: '1.5' }}>
            {currentStep.content}
          </p>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Bước {tourStep + 1} / {tourSteps.length}
            </span>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={handleEndTour}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold', padding: '6px 10px' }}
              >
                Bỏ qua
              </button>
              {tourStep > 0 && (
                <button 
                  onClick={handlePrev}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold', padding: '6px 12px' }}
                >
                  Quay lại
                </button>
              )}
              <button 
                onClick={handleNext}
                style={{ background: '#8C6239', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold', padding: '6px 12px', boxShadow: '0 4px 10px rgba(140, 98, 57, 0.3)' }}
              >
                {tourStep === tourSteps.length - 1 ? "Bắt đầu" : "Tiếp tục"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(7, 10, 19, 0.85)',
      backdropFilter: 'blur(8px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        background: '#0B132B',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(255,255,255,0.01)'
        }}>
          <div>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '17px', fontWeight: 'bold' }}>
              🛠️ Biên tập sơ đồ trực quan (React Flow)
            </h3>
            <span style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px', display: 'block' }}>
              Kéo thả các khối để sắp xếp lại, kéo nối giữa các chấm tròn để liên kết quy trình.
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              onClick={() => setTourStep(0)}
              style={{
                background: 'rgba(140, 98, 57, 0.1)',
                border: '1px solid rgba(140, 98, 57, 0.3)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 'bold',
                color: '#8C6239',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
              title="Hướng dẫn nhanh"
            >
              💡 Hướng dẫn nhanh
            </button>
            <button 
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              title="Đóng cửa sổ"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
          {/* Sidebar Palette */}
          <div style={{
            width: '240px',
            background: 'rgba(11, 19, 43, 0.95)',
            borderRight: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            overflowY: 'auto',
            zIndex: 10,
          }}
          className="flow-sidebar-palette"
          >
            <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <LayoutGrid size={15} style={{ color: '#8C6239' }} /> Thư viện Khối
            </h4>
            <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: '1.4' }}>
              Kéo thả các khối vào canvas, hoặc click trực tiếp để thêm nhanh vào tâm sơ đồ.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
              {/* Input Node */}
              <div 
                draggable
                onDragStart={(e) => onDragStart(e, 'input')}
                onClick={() => handleQuickAddNode('input')}
                style={{
                  padding: '10px 14px',
                  borderRadius: '20px',
                  background: 'rgba(16, 185, 129, 0.05)',
                  border: '1px solid #10B981',
                  color: '#f8fafc',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'grab',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                className="palette-node-item"
              >
                <Play size={12} style={{ color: '#10B981' }} />
                <span>Khối Đầu vào (Input)</span>
              </div>

              {/* Process Node */}
              <div 
                draggable
                onDragStart={(e) => onDragStart(e, 'process')}
                onClick={() => handleQuickAddNode('process')}
                style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  background: 'rgba(140, 98, 57, 0.05)',
                  border: '1px solid #8C6239',
                  color: '#f8fafc',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'grab',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                className="palette-node-item"
              >
                <Layers size={12} style={{ color: '#8C6239' }} />
                <span>Khối Tiến trình (Process)</span>
              </div>

              {/* Decision Node */}
              <div 
                draggable
                onDragStart={(e) => onDragStart(e, 'decision')}
                onClick={() => handleQuickAddNode('decision')}
                style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  background: 'rgba(255, 145, 0, 0.05)',
                  border: '1px solid #FF9100',
                  color: '#f8fafc',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'grab',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                className="palette-node-item"
              >
                <GitFork size={12} style={{ color: '#FF9100' }} />
                <span>Khối Quyết định (Decision)</span>
              </div>

              {/* Output Node */}
              <div 
                draggable
                onDragStart={(e) => onDragStart(e, 'output')}
                onClick={() => handleQuickAddNode('output')}
                style={{
                  padding: '10px 14px',
                  borderRadius: '20px',
                  background: 'rgba(59, 130, 246, 0.05)',
                  border: '1px solid #3b82f6',
                  color: '#f8fafc',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'grab',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                className="palette-node-item"
              >
                <CheckCircle2 size={12} style={{ color: '#3b82f6' }} />
                <span>Khối Kết quả (Output)</span>
              </div>
            </div>

            {/* Quick Tips */}
            <div style={{
              marginTop: 'auto',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              padding: '12px',
            }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#8C6239', display: 'block', marginBottom: '4px' }}>💡 Hướng dẫn nhanh</span>
              <ul style={{ margin: 0, paddingLeft: '14px', fontSize: '10px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li>Nhấp đúp chuột vào khối/đường nối để chỉnh sửa nội dung nhanh.</li>
                <li>Quét chuột (giữ Shift) để chọn nhiều khối cùng lúc.</li>
                <li>Chọn một khối để nhân bản nhanh hoặc xóa.</li>
              </ul>
            </div>
          </div>

          {/* React Flow Canvas */}
          <div 
            style={{ flex: 1, height: '100%', position: 'relative' }}
            onDragOver={onDragOver}
            onDrop={onDrop}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
            >
              <Controls style={{ background: '#1C2541', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
              <Background color="rgba(255,255,255,0.12)" gap={16} />
              
              <Panel position="top-left" style={{ display: 'flex', gap: '8px' }} className="flow-top-toolbar">
                <button 
                  onClick={() => onLayout('TB')}
                  style={{
                    background: '#8C6239',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(140, 98, 57, 0.3)'
                  }}
                  title="Tự động xếp sơ đồ theo chiều dọc"
                >
                  <RefreshCw size={13} /> Sắp xếp dọc
                </button>
                <button 
                  onClick={() => onLayout('LR')}
                  style={{
                    background: '#1C2541',
                    color: '#e2e8f0',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  title="Tự động xếp sơ đồ theo chiều ngang"
                >
                  <RefreshCw size={13} /> Sắp xếp ngang
                </button>
                <button 
                  onClick={handleResetLayout}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: '#94a3b8',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  title="Khôi phục lại sơ đồ gốc của slide"
                >
                  Reset gốc
                </button>
              </Panel>
            </ReactFlow>
          </div>

          {/* Slide Reference Content Panel */}
          {renderSlideReference()}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(255,255,255,0.01)'
        }}>
          {/* Autosave Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#94a3b8' }}>
            {saveStatus === 'saving' && (
              <>
                <RefreshCw size={12} className="animate-spin" style={{ color: '#FF9100' }} />
                <span style={{ color: '#e2e8f0' }}>Đang tự động lưu nháp...</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <CheckCircle2 size={12} style={{ color: '#10B981' }} />
                <span style={{ color: '#10B981', fontWeight: 'bold' }}>Đã lưu nháp tự động</span>
              </>
            )}
            {saveStatus === 'idle' && (
              <span style={{ color: '#64748b' }}>Trạng thái: Sẵn sàng</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#94a3b8',
                padding: '10px 20px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Hủy bỏ
            </button>
            <button 
              onClick={handleSave}
              style={{
                background: '#8C6239',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                padding: '10px 20px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(140, 98, 57, 0.3)'
              }}
            >
              <Save size={16} /> Lưu bố cục
            </button>
          </div>
        </div>
      </div>

      {/* Render walkthrough tour */}
      {renderTour()}
    </div>
  );
}

// Wrapper component to provide ReactFlowProvider context to ReactFlowEditor hooks
export default function ReactFlowEditorModal(props: ReactFlowEditorModalProps) {
  if (!props.isOpen) return null;
  
  const content = (
    <ReactFlowProvider>
      <ReactFlowEditor {...props} />
    </ReactFlowProvider>
  );

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }

  return content;
}

interface ReactFlowEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  mermaidCode: string;
  slideMarkdown?: string;
  savedLayout: string | null; // Saved JSON string containing flow layout
  onSave: (layoutJson: string) => void;
}
