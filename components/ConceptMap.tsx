'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ConceptGraph, ConceptNode } from '@/types';

interface ConceptMapProps {
  graph: ConceptGraph;
  height?: number;
}

// Level 0 = broadest field (top), higher = narrower
const LEVEL_STYLE: Record<number, { fill: string; stroke: string; r: number; fontSize: number }> = {
  0: { fill: '#3B82F6', stroke: '#1D4ED8', r: 32, fontSize: 11 },
  1: { fill: '#8B5CF6', stroke: '#6D28D9', r: 26, fontSize: 10 },
  2: { fill: '#10B981', stroke: '#047857', r: 20, fontSize: 10 },
  3: { fill: '#F59E0B', stroke: '#B45309', r: 15, fontSize: 9 },
  4: { fill: '#F97316', stroke: '#C2410C', r: 12, fontSize: 9 },
  5: { fill: '#EF4444', stroke: '#B91C1C', r: 10, fontSize: 8 },
};

const LEVEL_LABEL: Record<number, string> = {
  0: 'Field',
  1: 'Subfield',
  2: 'Topic',
  3: 'Narrow topic',
  4: 'Narrow',
  5: 'Narrow',
};

function styleFor(level: number) {
  return LEVEL_STYLE[Math.min(level, 5)] ?? LEVEL_STYLE[5];
}

interface SimNode extends ConceptNode {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export default function ConceptMap({ graph, height = 460 }: ConceptMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: ConceptNode } | null>(null);
  const simRef = useRef<{ stop: () => void } | null>(null);

  const draw = useCallback(async () => {
    if (!svgRef.current || graph.nodes.length === 0) return;

    const d3 = await import('d3');
    const svg = d3.select(svgRef.current);
    const W = svgRef.current.clientWidth || 640;
    const H = height;
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    svg.selectAll('*').remove();

    // Arrow marker
    svg
      .append('defs')
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 10)
      .attr('refY', 0)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#CBD5E1');

    const g = svg.append('g');

    // Zoom & pan
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.25, 5])
        .on('zoom', (e) => g.attr('transform', e.transform))
    );

    const mainNode = graph.nodes.find((n) => n.isMain);
    const mainId = mainNode?.id ?? '';

    // Clone nodes with initial positions spread by level
    const nodes: SimNode[] = graph.nodes.map((n) => {
      const angle = Math.random() * 2 * Math.PI;
      const r = 80 + n.level * 60;
      return {
        ...n,
        x: n.isMain ? W / 2 : W / 2 + Math.cos(angle) * r,
        y: n.isMain ? H / 2 : H / 2 + Math.sin(angle) * r,
      };
    });

    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const links = graph.links
      .map((l) => {
        const src = nodeById.get(typeof l.source === 'string' ? l.source : (l.source as ConceptNode).id);
        const tgt = nodeById.get(typeof l.target === 'string' ? l.target : (l.target as ConceptNode).id);
        if (!src || !tgt) return null;
        return { source: src, target: tgt, type: l.type };
      })
      .filter(Boolean) as { source: SimNode; target: SimNode; type: string }[];

    const sim = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, (typeof links)[0]>(links)
          .id((d) => d.id)
          .distance((l) => {
            const sl = (l.source as SimNode).level;
            const tl = (l.target as SimNode).level;
            return 70 + Math.abs(sl - tl) * 30;
          })
          .strength(0.5)
      )
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(W / 2, H / 2).strength(0.03))
      .force(
        'collide',
        d3.forceCollide<SimNode>().radius((d) => styleFor(d.level).r + 18).strength(0.9)
      )
      // Pull nodes vertically by level: level 0 near top, higher levels near bottom
      .force(
        'levelY',
        d3.forceY<SimNode>().y((d) => {
          if (d.isMain) return H / 2;
          if (d.level === 0) return H * 0.18;
          if (d.level === 1) return H * 0.32;
          return H * 0.62 + (d.level - 2) * 30;
        }).strength((d) => (d.isMain ? 0 : 0.25))
      );

    simRef.current = sim;

    // Fix the main node at center
    const mainSim = nodes.find((n) => n.isMain);
    if (mainSim) { mainSim.fx = W / 2; mainSim.fy = H / 2; }

    // Draw links
    const linkEls = g
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (d) => d.type === 'related' ? '#C4B5FD' : '#BAE6FD')
      .attr('stroke-width', (d) => d.type === 'related' ? 1.5 : 2)
      .attr('stroke-dasharray', (d) => d.type === 'related' ? '5,4' : null)
      .attr('opacity', 0.7)
      .attr('marker-end', 'url(#arrow)');

    // Draw node groups
    const nodeGs = g
      .append('g')
      .selectAll<SVGGElement, SimNode>('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'grab')
      .call(
        d3.drag<SVGGElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on('end', (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            if (!d.isMain) { d.fx = null; d.fy = null; }
          })
      );

    // Circle
    nodeGs
      .append('circle')
      .attr('r', (d) => d.isMain ? 36 : styleFor(d.level).r)
      .attr('fill', (d) => d.isMain ? '#1D4ED8' : styleFor(d.level).fill)
      .attr('stroke', (d) => d.isMain ? '#1e3a8a' : styleFor(d.level).stroke)
      .attr('stroke-width', (d) => d.isMain ? 3 : 1.5)
      .attr('fill-opacity', (d) => d.isMain ? 1 : 0.88);

    // Label inside or below node
    nodeGs.each(function (d) {
      const g = d3.select(this);
      const style = styleFor(d.level);
      const r = d.isMain ? 36 : style.r;
      const maxChars = Math.floor(r * 2.2 / (d.isMain ? 7 : 6));
      const label = d.name.length > maxChars ? d.name.slice(0, maxChars - 1) + '…' : d.name;
      const words = label.split(' ');

      if (d.isMain || r >= 20) {
        // Label inside circle (multi-line)
        const lineH = d.isMain ? 13 : 11;
        const lines: string[] = [];
        let cur = '';
        for (const w of words) {
          const test = cur ? `${cur} ${w}` : w;
          if (test.length > maxChars && cur) { lines.push(cur); cur = w; }
          else cur = test;
        }
        if (cur) lines.push(cur);
        const startY = -((lines.length - 1) * lineH) / 2;
        lines.forEach((line, i) => {
          g.append('text')
            .text(line)
            .attr('text-anchor', 'middle')
            .attr('y', startY + i * lineH)
            .attr('dy', '0.35em')
            .attr('font-size', d.isMain ? 12 : style.fontSize)
            .attr('font-weight', d.isMain ? '700' : '500')
            .attr('fill', '#fff')
            .style('pointer-events', 'none');
        });
      } else {
        // Label below small node
        g.append('text')
          .text(label)
          .attr('text-anchor', 'middle')
          .attr('y', r + 11)
          .attr('font-size', style.fontSize)
          .attr('font-weight', '500')
          .attr('fill', styleFor(d.level).stroke)
          .style('pointer-events', 'none');
      }
    });

    // Tooltip hover
    nodeGs
      .on('mouseenter', (event, d) => {
        const rect = svgRef.current!.getBoundingClientRect();
        setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, node: d });
      })
      .on('mouseleave', () => setTooltip(null));

    sim.on('tick', () => {
      linkEls
        .attr('x1', (d) => (d.source as SimNode).x)
        .attr('y1', (d) => (d.source as SimNode).y)
        .attr('x2', (d) => {
          const s = d.source as SimNode;
          const t = d.target as SimNode;
          const dx = t.x - s.x, dy = t.y - s.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const r = styleFor(t.level).r + 4;
          return t.x - (dx / dist) * r;
        })
        .attr('y2', (d) => {
          const s = d.source as SimNode;
          const t = d.target as SimNode;
          const dx = t.x - s.x, dy = t.y - s.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const r = styleFor(t.level).r + 4;
          return t.y - (dy / dist) * r;
        });

      nodeGs.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    return () => sim.stop();
  }, [graph, height]);

  useEffect(() => {
    const cleanup = draw();
    return () => {
      cleanup.then((fn) => fn?.());
      simRef.current?.stop();
    };
  }, [draw]);

  if (graph.nodes.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center bg-slate-50 rounded-xl border border-slate-200 text-slate-400 text-sm gap-2"
        style={{ height }}
      >
        <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Concept map appears after search
      </div>
    );
  }

  const mainNode = graph.nodes.find((n) => n.isMain);

  return (
    <div className="relative bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50">
        <span className="text-xs font-semibold text-slate-600">
          {mainNode ? `"${mainNode.name}"` : 'Concept Map'}
        </span>
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((lvl) => (
            <span key={lvl} className="flex items-center gap-1 text-xs text-slate-500">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ backgroundColor: LEVEL_STYLE[lvl].fill }}
              />
              {LEVEL_LABEL[lvl]}
            </span>
          ))}
        </div>
      </div>

      <svg ref={svgRef} className="w-full" style={{ height }} />

      {tooltip && (
        <div
          className="absolute z-20 pointer-events-none bg-white border border-slate-200 rounded-lg shadow-xl p-3 w-56"
          style={{
            left: Math.min(tooltip.x + 14, (svgRef.current?.clientWidth ?? 600) - 230),
            top: Math.max(tooltip.y - 8, 8),
          }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: tooltip.node.isMain ? '#1D4ED8' : styleFor(tooltip.node.level).fill }}
            />
            <span className="font-semibold text-slate-800 text-sm leading-tight">{tooltip.node.name}</span>
          </div>
          <div className="text-xs text-slate-500 space-y-0.5">
            <p>{tooltip.node.isMain ? 'Search topic' : LEVEL_LABEL[Math.min(tooltip.node.level, 5)]}</p>
            {tooltip.node.worksCount > 0 && (
              <p>{tooltip.node.worksCount.toLocaleString()} works in OpenAlex</p>
            )}
            {tooltip.node.description && (
              <p className="mt-1.5 text-slate-600 leading-snug line-clamp-3">{tooltip.node.description}</p>
            )}
          </div>
        </div>
      )}

      <div className="absolute bottom-2 right-3 text-xs text-slate-300 select-none">
        Scroll to zoom · Drag to pan
      </div>
    </div>
  );
}
