'use client';

import { ConceptGraph, ConceptNode } from '@/types';

interface ConceptMapProps {
  graph: ConceptGraph;
  height?: number;
  onSearch?: (query: string) => void;
}

interface ColumnProps {
  title: string;
  subtitle: string;
  nodes: ConceptNode[];
  accent: string;
  chipClass: string;
  mainNode?: ConceptNode;
  onSearch?: (query: string) => void;
}

function formatWorks(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function Column({ title, subtitle, nodes, accent, chipClass, mainNode, onSearch }: ColumnProps) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${accent}`}>
          {title}
        </span>
        <span className="text-xs text-slate-400">{subtitle}</span>
      </div>

      {/* Main concept pill — always clickable */}
      {mainNode && (
        <button
          onClick={() => onSearch?.(mainNode.name)}
          title={`Search "${mainNode.name}"`}
          className="w-full text-center text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg px-3 py-2 leading-snug mb-1 transition-colors"
        >
          {mainNode.name}
        </button>
      )}

      <div className="flex flex-col gap-1.5">
        {nodes.length === 0 && (
          <span className="text-xs text-slate-300 italic">—</span>
        )}
        {nodes.map((node) => (
          <button
            key={node.id}
            onClick={() => onSearch?.(node.name)}
            title={node.description ? `${node.description}\n\nClick to search` : `Search "${node.name}"`}
            className={`text-left text-xs rounded-lg px-2.5 py-1.5 leading-snug transition-colors ${chipClass} ${
              onSearch ? 'cursor-pointer hover:ring-1 hover:ring-current hover:ring-opacity-30' : 'cursor-default'
            }`}
          >
            {node.name}
            {node.worksCount > 0 && (
              <span className="ml-1.5 opacity-40 text-[10px]">{formatWorks(node.worksCount)}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ConceptMap({ graph, onSearch }: ConceptMapProps) {
  if (graph.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-36 bg-slate-50 rounded-xl border border-slate-200 text-slate-400 text-sm">
        Concept map appears after search
      </div>
    );
  }

  const mainNode = graph.nodes.find((n) => n.isMain);
  const mainLevel = mainNode?.level ?? 2;

  // Categorise by level relative to the main concept
  const broad: ConceptNode[] = [];
  const related: ConceptNode[] = [];
  const narrow: ConceptNode[] = [];

  for (const node of graph.nodes) {
    if (node.isMain) continue;
    if (node.level < mainLevel) broad.push(node);
    else if (node.level === mainLevel) related.push(node);
    else narrow.push(node);
  }

  // Sort: broad by level asc (most general first), rest by score desc
  broad.sort((a, b) => a.level - b.level || b.worksCount - a.worksCount);
  related.sort((a, b) => b.score - a.score);
  narrow.sort((a, b) => b.score - a.score);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Title bar */}
      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">Concept Map</span>
        {mainNode && (
          <span className="text-xs text-slate-400">
            {graph.nodes.length} concepts
          </span>
        )}
      </div>

      {/* Three columns */}
      {onSearch && (
        <p className="px-4 pt-2 text-xs text-slate-400">
          Click any keyword to search it
        </p>
      )}
      <div className="grid grid-cols-3 divide-x divide-slate-100 p-4 gap-0">
        <div className="pr-4">
          <Column
            title="Broader"
            subtitle="parent fields"
            nodes={broad}
            accent="bg-blue-100 text-blue-700"
            chipClass="bg-blue-50 text-blue-800 hover:bg-blue-100"
            onSearch={onSearch}
          />
        </div>
        <div className="px-4">
          <Column
            title="Related"
            subtitle="peer topics"
            nodes={related}
            mainNode={mainNode}
            accent="bg-slate-100 text-slate-600"
            chipClass="bg-slate-50 text-slate-700 hover:bg-slate-100"
            onSearch={onSearch}
          />
        </div>
        <div className="pl-4">
          <Column
            title="Narrower"
            subtitle="sub-topics"
            nodes={narrow}
            accent="bg-amber-100 text-amber-700"
            chipClass="bg-amber-50 text-amber-800 hover:bg-amber-100"
            onSearch={onSearch}
          />
        </div>
      </div>
    </div>
  );
}
