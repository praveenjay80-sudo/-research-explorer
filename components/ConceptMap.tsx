'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ConceptGraph, ConceptNode, ConceptLink } from '@/types';

interface ConceptMapProps {
  graph: ConceptGraph;
  height?: number;
}

const LEVEL_CONFIG: Record<
  number,
  { color: string; radius: number; label: string; textColor: string }
> = {
  0: { color: '#3B82F6', radius: 28, label: 'Field', textColor: '#1D4ED8' },
  1: { color: '#8B5CF6', radius: 22, label: 'Subfield', textColor: '#6D28D9' },
  2: { color: '#10B981', radius: 16, label: 'Topic', textColor: '#047857' },
  3: { color: '#F59E0B', radius: 12, label: 'Narrow', textColor: '#B45309' },
  4: { color: '#F97316', radius: 10, label: 'Narrow', textColor: '#C2410C' },
  5: { color: '#EF4444', radius: 8, label: 'Narrow', textColor: '#B91C1C' },
};

function getLevelConfig(level: number) {
  return LEVEL_CONFIG[Math.min(level, 5)] ?? LEVEL_CONFIG[5];
}

interface SimNode extends ConceptNode {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface SimLink {
  source: SimNode;
  target: SimNode;
  type: 'broader' | 'related';
}

export default function ConceptMap({ graph, height = 420 }: ConceptMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    node: ConceptNode;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const simulationRef = useRef<{ stop: () => void } | null>(null);

  const runSimulation = useCallback(async () => {
    if (!svgRef.current || graph.nodes.length === 0) return;

    const d3 = await import('d3');
    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth || 700;
    svg.attr('width', width).attr('height', height);

    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    defs
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#CBD5E1');

    const g = svg.append('g').attr('class', 'zoom-group');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Clone nodes for simulation
    const nodes: SimNode[] = graph.nodes.map((n) => ({
      ...n,
      x: width / 2 + (Math.random() - 0.5) * 200,
      y: height / 2 + (Math.random() - 0.5) * 200,
    }));

    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const links: SimLink[] = (graph.links as ConceptLink[])
      .map((l) => {
        const source = nodeById.get(typeof l.source === 'string' ? l.source : (l.source as ConceptNode).id);
        const target = nodeById.get(typeof l.target === 'string' ? l.target : (l.target as ConceptNode).id);
        if (!source || !target) return null;
        return { source, target, type: l.type };
      })
      .filter(Boolean) as SimLink[];

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => {
            const targetLevel = (l.target as SimNode).level;
            return 60 + targetLevel * 20;
          })
          .strength(0.4)
      )
      .force('charge', d3.forceManyBody().strength(-180))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force(
        'collide',
        d3
          .forceCollide<SimNode>()
          .radius((d) => getLevelConfig(d.level).radius + 10)
          .strength(0.8)
      )
      .force(
        'y',
        d3
          .forceY<SimNode>()
          .y((d) => (d.level / 5) * height * 0.6 + height * 0.2)
          .strength(0.15)
      );

    simulationRef.current = simulation;

    // Draw links
    const linkEl = g
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#E2E8F0')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', (d) => (d.type === 'related' ? '4,3' : null))
      .attr('marker-end', 'url(#arrowhead)');

    // Draw nodes
    const nodeEl = g
      .append('g')
      .selectAll<SVGGElement, SimNode>('g.node')
      .data(nodes)
      .join('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag<SVGGElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    nodeEl
      .append('circle')
      .attr('r', (d) => getLevelConfig(d.level).radius)
      .attr('fill', (d) => getLevelConfig(d.level).color)
      .attr('fill-opacity', 0.85)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Label for larger nodes
    nodeEl
      .filter((d) => d.level <= 2)
      .append('text')
      .text((d) => (d.name.length > 16 ? d.name.slice(0, 14) + '…' : d.name))
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => getLevelConfig(d.level).radius + 12)
      .attr('font-size', (d) => (d.level === 0 ? 11 : d.level === 1 ? 10 : 9))
      .attr('fill', (d) => getLevelConfig(d.level).textColor)
      .attr('font-weight', (d) => (d.level === 0 ? '700' : '500'))
      .style('pointer-events', 'none');

    // Tooltip & selection
    nodeEl
      .on('mouseenter', (event, d) => {
        const rect = svgRef.current!.getBoundingClientRect();
        setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, node: d });
        d3.select(event.currentTarget as SVGGElement)
          .select('circle')
          .attr('stroke', '#1D4ED8')
          .attr('stroke-width', 3);
      })
      .on('mouseleave', (event) => {
        setTooltip(null);
        d3.select(event.currentTarget as SVGGElement)
          .select('circle')
          .attr('stroke', '#fff')
          .attr('stroke-width', 2);
      })
      .on('click', (_, d) => {
        setSelectedId((prev) => (prev === d.id ? null : d.id));
      });

    simulation.on('tick', () => {
      linkEl
        .attr('x1', (d) => (d.source as SimNode).x)
        .attr('y1', (d) => (d.source as SimNode).y)
        .attr('x2', (d) => (d.target as SimNode).x)
        .attr('y2', (d) => (d.target as SimNode).y);

      nodeEl.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [graph, height]);

  useEffect(() => {
    const cleanup = runSimulation();
    return () => {
      cleanup.then((fn) => fn?.());
      simulationRef.current?.stop();
    };
  }, [runSimulation]);

  if (graph.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm bg-slate-50 rounded-xl border border-slate-200">
        Concept map will appear after searching
      </div>
    );
  }

  return (
    <div className="relative bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1.5">
        {Object.entries(LEVEL_CONFIG)
          .slice(0, 4)
          .map(([level, cfg]) => (
            <span
              key={level}
              className="inline-flex items-center gap-1 text-xs bg-white border border-slate-200 rounded-full px-2 py-0.5 shadow-sm"
            >
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ backgroundColor: cfg.color }}
              />
              {cfg.label}
            </span>
          ))}
        <span className="text-xs text-slate-400 bg-white border border-slate-200 rounded-full px-2 py-0.5 shadow-sm">
          Scroll to zoom · Drag nodes
        </span>
      </div>

      <div ref={containerRef} style={{ height }}>
        <svg ref={svgRef} className="w-full" style={{ height }} />
      </div>

      {tooltip && (
        <div
          className="absolute z-20 pointer-events-none bg-white border border-slate-200 rounded-lg shadow-lg p-3 max-w-xs"
          style={{
            left: Math.min(tooltip.x + 12, (svgRef.current?.clientWidth ?? 700) - 220),
            top: Math.max(tooltip.y - 10, 8),
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: getLevelConfig(tooltip.node.level).color }}
            />
            <span className="font-semibold text-slate-800 text-sm">{tooltip.node.name}</span>
          </div>
          <div className="text-xs text-slate-500 space-y-0.5">
            <div>{getLevelConfig(tooltip.node.level).label} (level {tooltip.node.level})</div>
            {tooltip.node.worksCount > 0 && (
              <div>{tooltip.node.worksCount.toLocaleString()} works</div>
            )}
            {tooltip.node.description && (
              <div className="mt-1 text-slate-600 line-clamp-3">{tooltip.node.description}</div>
            )}
          </div>
        </div>
      )}

      {selectedId && (
        <div className="absolute bottom-3 left-3 z-10 bg-white border border-blue-200 rounded-lg px-3 py-1.5 text-xs text-blue-700 shadow-sm">
          Selected: <strong>{graph.nodes.find((n) => n.id === selectedId)?.name}</strong>
          <button onClick={() => setSelectedId(null)} className="ml-2 text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
