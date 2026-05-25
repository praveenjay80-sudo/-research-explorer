'use client';

import { ConceptGraph, ConceptNode } from '@/types';

interface ConceptMapProps {
  graph: ConceptGraph;
  height?: number; // kept for API compat, not used
}

interface ColumnProps {
  title: string;
  subtitle: string;
  nodes: ConceptNode[];
  accent: string;        // tailwind bg class for header pill
  chipClass: string;     // tailwind classes for each chip
  mainNode?: ConceptNode;
}

function Column({ title, subtitle, nodes, accent, chipClass, mainNode }: ColumnProps) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      {/* Column header */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${accent}`}>
          {title}
        </span>
        <span className="text-xs text-slate-400">{subtitle}</span>
      </div>

      {/* Main concept (only in centre column) */}
      {mainNode && (
        <span className="inline-block w-full text-center text-sm font-bold text-white bg-blue-600 rounded-lg px-3 py-2 leading-snug mb-1">
          {mainNode.name}
        </span>
      )}

      {/* Concept chips */}
      <div className="flex flex-col gap-1.5">
        {nodes.length === 0 && (
          <span className="text-xs text-slate-300 italic">—</span>
        )}
        {nodes.map((node) => (
          <span
            key={node.id}
            title={node.description ?? node.name}
            className={`text-xs rounded-lg px-2.5 py-1.5 leading-snug cursor-default select-none transition-colors ${chipClass}`}
          >
            {node.name}
            {node.worksCount > 0 && (
              <span className="ml-1.5 opacity-50 text-[10px]">
                {node.worksCount >= 1_000_000
                  ? `${(node.worksCount / 1_000_000).toFixed(1)}M`
                  : node.worksCount >= 1_000
                  ? `${(node.worksCount / 1_000).toFixed(0)}K`
                  : node.worksCount}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ConceptMap({ graph }: ConceptMapProps) {
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
      <div className="grid grid-cols-3 divide-x divide-slate-100 p-4 gap-0">
        <div className="pr-4">
          <Column
            title="Broader"
            subtitle="parent fields"
            nodes={broad}
            accent="bg-blue-100 text-blue-700"
            chipClass="bg-blue-50 text-blue-800 hover:bg-blue-100"
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
          />
        </div>
        <div className="pl-4">
          <Column
            title="Narrower"
            subtitle="sub-topics"
            nodes={narrow}
            accent="bg-amber-100 text-amber-700"
            chipClass="bg-amber-50 text-amber-800 hover:bg-amber-100"
          />
        </div>
      </div>
    </div>
  );
}
