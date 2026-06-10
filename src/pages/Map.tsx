import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as d3 from 'd3';
import { useAppStore } from '../store';
import { colorForNewSection } from '../lib/sections';
import { Network } from 'lucide-react';

type Node = d3.SimulationNodeDatum & {
  id: string;
  name: string;
  group: 'section' | 'idea';
  radius: number;
  color?: string;
  sectionId?: string;
  type?: string;
};

type Link = d3.SimulationLinkDatum<Node> & {
  source: string | Node;
  target: string | Node;
  type?: 'section' | 'related';
};

export default function MapPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [newSectionName, setNewSectionName] = useState('');
  const { ideas, sections, isDarkMode, addSection } = useAppStore();
  const navigate = useNavigate();

  const createSectionFromMap = () => {
    const name = newSectionName.trim().replace(/\s+/g, ' ');
    if (!name) return null;
    const existing = sections.find((section) => section.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      setNewSectionName('');
      return existing.id;
    }
    const id = addSection({
      name,
      color: colorForNewSection(sections),
    });
    setNewSectionName('');
    return id;
  };

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Colors based on dark mode
    const colors = {
      sectionNode: isDarkMode ? '#f5f5f4' : '#1c1917', // stone-100 vs stone-900
      sectionText: isDarkMode ? '#1c1917' : '#f5f5f4', // stone-900 vs stone-100
      ideaNode: isDarkMode ? '#1c1917' : '#ffffff',
      ideaText: isDarkMode ? '#d6d3d1' : '#44403c', // stone-300 vs stone-700
      ideaStroke: isDarkMode ? '#44403c' : '#d6d3d1', // stone-700 vs stone-300
      linkSection: isDarkMode ? '#292524' : '#e7e5e4', // stone-800 vs stone-200
      linkRelated: isDarkMode ? '#44403c' : '#d6d3d1', // stone-700 vs stone-300
      bg: isDarkMode ? '#0c0a09' : '#fafaf9', // stone-950 vs stone-50
    };

    // Clear previous SVG content
    d3.select(svgRef.current).selectAll('*').remove();

    // Prepare data
    const nodes: Node[] = [];
    const links: Link[] = [];

    // Add section nodes
    sections.forEach((section, index) => {
      const angle = (index / Math.max(sections.length, 1)) * Math.PI * 2;
      const orbit = Math.min(width, height) * 0.28;
      nodes.push({
        id: section.id,
        name: section.name,
        group: 'section',
        radius: 50,
        color: colors.sectionNode,
        fx: Math.cos(angle) * orbit,
        fy: Math.sin(angle) * orbit,
      });
    });

    // Add idea nodes and links
    ideas.forEach(idea => {
      const ideaNodeId = `idea-${idea.id}`;
      const isPrinciple = idea.type === 'Principle';
      // Scale radius between 18 and 40 based on maturity (0-100), Principles are fixed size
      const scaledRadius = isPrinciple ? 28 : 18 + (idea.maturity / 100) * 22;
      nodes.push({
        id: ideaNodeId,
        name: idea.title,
        group: 'idea',
        radius: scaledRadius,
        color: isPrinciple ? (isDarkMode ? '#451a03' : '#fffbeb') : colors.ideaNode,
        type: idea.type,
        sectionId: idea.sectionId,
      } as any);

      // Link to section
      if (idea.sectionId) {
        links.push({
          source: idea.sectionId,
          target: ideaNodeId,
          type: 'section'
        });
      }

      // Link to related ideas
      if (idea.relatedIdeaIds) {
        idea.relatedIdeaIds.forEach(relatedId => {
          const targetNodeId = `idea-${relatedId}`;
          const exists = links.some(l => 
            (l.source === ideaNodeId && l.target === targetNodeId) || 
            (l.source === targetNodeId && l.target === ideaNodeId)
          );
          if (!exists) {
            links.push({
              source: ideaNodeId,
              target: targetNodeId,
              type: 'related'
            });
          }
        });
      }
    });

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    const defs = svg.append('defs');

    sections.forEach((section, index) => {
      const gradient = defs
        .append('radialGradient')
        .attr('id', `section-halo-${section.id}`)
        .attr('cx', '50%')
        .attr('cy', '50%')
        .attr('r', '50%');

      const hue = (index * 67) % 360;
      const center = isDarkMode ? `hsla(${hue}, 80%, 60%, 0.18)` : `hsla(${hue}, 85%, 70%, 0.22)`;
      const edge = isDarkMode ? `hsla(${hue}, 80%, 40%, 0)` : `hsla(${hue}, 85%, 60%, 0)`;

      gradient.append('stop').attr('offset', '0%').attr('stop-color', center);
      gradient.append('stop').attr('offset', '65%').attr('stop-color', isDarkMode ? `hsla(${hue}, 75%, 55%, 0.08)` : `hsla(${hue}, 80%, 68%, 0.1)`);
      gradient.append('stop').attr('offset', '100%').attr('stop-color', edge);
    });

    // Add zoom capabilities
    const g = svg.append('g');
    
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);
    
    // Center initially
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2));

    const simulation = d3.forceSimulation<Node>(nodes)
      .force('link', d3.forceLink<Node, Link>(links).id(d => d.id).distance((link) => link.type === 'section' ? 170 : 230).strength((link) => link.type === 'section' ? 0.45 : 0.12))
      .force('charge', d3.forceManyBody<Node>().strength((d) => d.group === 'section' ? -2200 : -900))
      .force('x', d3.forceX<Node>(d => d.group === 'section' ? (d.fx ?? 0) : 0).strength(d => d.group === 'section' ? 0.45 : 0.02))
      .force('y', d3.forceY<Node>(d => d.group === 'section' ? (d.fy ?? 0) : 0).strength(d => d.group === 'section' ? 0.45 : 0.02))
      .force('collide', d3.forceCollide().radius(d => (d as Node).radius + ((d as Node).group === 'section' ? 80 : 24)));

    const sectionNodes = nodes.filter((node) => node.group === 'section');

    const halos = g.append('g')
      .attr('class', 'section-halos')
      .selectAll('path')
      .data(sectionNodes)
      .join('path')
      .attr('fill', (d) => `url(#section-halo-${d.id})`)
      .attr('stroke', isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(28,25,23,0.05)')
      .attr('stroke-width', 1.25)
      .attr('pointer-events', 'none')
      .attr('opacity', 0.95);

    // Draw links
    const link = g.append('g')
      .selectAll('path')
      .data(links)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', d => d.type === 'section' ? colors.linkSection : colors.linkRelated)
      .attr('stroke-opacity', d => d.type === 'section' ? 0.28 : 0.16)
      .attr('stroke-width', d => d.type === 'section' ? 2.2 : 1.2)
      .attr('stroke-dasharray', d => d.type === 'related' ? '7,6' : 'none')
      .attr('stroke-linecap', 'round')
      .attr('class', 'transition-opacity duration-300');

    // Draw nodes
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'node-group')
      .call(d3.drag<SVGGElement, Node>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended) as any)
      .on('click', (event, d) => {
        if (d.group === 'idea') {
          const ideaId = d.id.replace('idea-', '');
          navigate(`/ideas/${ideaId}`);
        }
      })
      .on('mouseenter', (event, d) => {
        const connectedNodeIds = new Set<string>();
        connectedNodeIds.add(d.id);
        
        links.forEach(l => {
          const sourceId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
          const targetId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
          if (sourceId === d.id) connectedNodeIds.add(targetId);
          if (targetId === d.id) connectedNodeIds.add(sourceId);
        });

        node.transition().duration(200)
          .style('opacity', n => connectedNodeIds.has(n.id) ? 1 : 0.12);

        halos.transition().duration(200)
          .style('opacity', haloNode => {
            const sameField = haloNode.id === d.id || haloNode.id === d.sectionId || (d.group === 'section' && haloNode.id === d.id);
            return sameField ? 1 : 0.18;
          });
        
        link.transition().duration(200)
          .style('opacity', l => {
            const sourceId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
            const targetId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
            return (sourceId === d.id || targetId === d.id) ? 0.95 : 0.04;
          })
          .attr('stroke-width', l => {
            const sourceId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
            const targetId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
            return (sourceId === d.id || targetId === d.id) ? 2.8 : 1;
          });
      })
      .on('mouseleave', () => {
        node.transition().duration(200).style('opacity', 1);
        halos.transition().duration(200).style('opacity', 0.95);
        link.transition().duration(200)
          .style('opacity', d => d.type === 'section' ? 0.28 : 0.16)
          .attr('stroke-width', d => d.type === 'section' ? 2.2 : 1.2);
      });

    node.append('circle')
      .attr('r', d => d.group === 'section' ? d.radius + 10 : d.radius + 5)
      .attr('fill', d => d.group === 'section'
        ? (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.65)')
        : ((d as any).type === 'Principle'
          ? (isDarkMode ? 'rgba(245,158,11,0.14)' : 'rgba(251,191,36,0.16)')
          : (isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.55)')))
      .attr('stroke', 'none')
      .attr('pointer-events', 'none')
      .style('filter', d => d.group === 'section' ? 'blur(1px)' : 'blur(3px)');

    // Node circles
    node.append('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => d.color || '#fff')
      .attr('stroke', d => {
        if (d.group === 'section') return 'none';
        const isPrinciple = (d as any).type === 'Principle';
        return isPrinciple ? (isDarkMode ? '#f59e0b' : '#d97706') : colors.ideaStroke;
      })
      .attr('stroke-width', d => d.group === 'idea' ? ((d as any).type === 'Principle' ? 2.5 : 1.5) : 0)
      .attr('class', d => d.group === 'idea' ? 'cursor-pointer hover:stroke-blue-500 transition-all duration-300' : 'cursor-grab active:cursor-grabbing')
      .style('filter', d => d.group === 'section' ? 'drop-shadow(0 8px 24px rgba(0,0,0,0.16))' : 'drop-shadow(0 8px 18px rgba(0,0,0,0.08))');

    // Node labels
    node.append('text')
      .text(d => {
        const words = d.name.split(' ');
        return words.length > 3 ? words.slice(0, 3).join(' ') + '...' : d.name;
      })
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .attr('fill', d => d.group === 'section' ? colors.sectionText : colors.ideaText)
      .attr('font-size', d => d.group === 'section' ? '13px' : '11px')
      .attr('font-weight', d => d.group === 'section' ? '700' : '600')
      .attr('pointer-events', 'none')
      .attr('class', 'font-sans tracking-tight')
      .call(wrapText, 80);

    simulation.on('tick', () => {
      halos.attr('d', (sectionNode) => {
        const memberNodes = nodes.filter((node) => node.group === 'idea' && node.sectionId === sectionNode.id);
        const points = [sectionNode, ...memberNodes].filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y));

        if (points.length < 2) {
          const x = sectionNode.x ?? 0;
          const y = sectionNode.y ?? 0;
          const r = sectionNode.radius + 110;
          return `M ${x - r},${y} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0`;
        }

        const hullPoints = points.map((node) => [node.x ?? 0, node.y ?? 0] as [number, number]);
        const hull = d3.polygonHull(hullPoints);
        if (!hull) {
          const x = sectionNode.x ?? 0;
          const y = sectionNode.y ?? 0;
          const r = sectionNode.radius + 120;
          return `M ${x - r},${y} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0`;
        }

        const centroid = d3.polygonCentroid(hull);
        const expanded = hull.map(([x, y]) => {
          const dx = x - centroid[0];
          const dy = y - centroid[1];
          const length = Math.sqrt(dx * dx + dy * dy) || 1;
          const padding = 105;
          return [x + (dx / length) * padding, y + (dy / length) * padding] as [number, number];
        });

        return d3.line<[number, number]>()
          .curve(d3.curveCatmullRomClosed.alpha(0.9))(expanded) || '';
      });

      link.attr('d', d => {
        const source = d.source as Node;
        const target = d.target as Node;

        const dx = (target.x ?? 0) - (source.x ?? 0);
        const dy = (target.y ?? 0) - (source.y ?? 0);
        const dr = Math.sqrt(dx * dx + dy * dy) * (d.type === 'section' ? 1.05 : 1.7);

        return `M${source.x},${source.y}A${dr},${dr} 0 0,1 ${target.x},${target.y}`;
      });

      node
        .attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Helper to wrap text inside circles
    function wrapText(text: any, width: number) {
      text.each(function(this: SVGTextElement, d: Node) {
        const textEl = d3.select(this);
        const words = textEl.text().split(/\s+/).reverse();
        let word;
        let line: string[] = [];
        let lineNumber = 0;
        const lineHeight = 1.1; // ems
        const y = textEl.attr("y");
        const dy = parseFloat(textEl.attr("dy") || "0");
        let tspan = textEl.text(null).append("tspan").attr("x", 0).attr("y", y).attr("dy", dy + "em");
        
        while (word = words.pop()) {
          line.push(word);
          tspan.text(line.join(" "));
          if ((tspan.node()?.getComputedTextLength() || 0) > width && line.length > 1) {
            line.pop();
            tspan.text(line.join(" "));
            line = [word];
            tspan = textEl.append("tspan").attr("x", 0).attr("y", y).attr("dy", ++lineNumber * lineHeight + dy + "em").text(word);
          }
        }
        
        const totalLines = lineNumber + 1;
        const offset = (totalLines - 1) * lineHeight / 2;
        textEl.selectAll("tspan").attr("dy", function(this: any, d, i) {
          return (dy - offset + (i as number) * lineHeight) + "em";
        });
      });
    }

    return () => {
      simulation.stop();
    };
  }, [ideas, sections, navigate, isDarkMode]);

  return (
    <div className="flex flex-col h-full w-full transition-colors duration-300">
      <header className="p-8 pb-6 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 z-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-100 flex items-center gap-4">
              <Network className="w-10 h-10 text-stone-400 dark:text-stone-600" />
              Idea Map
            </h1>
            <p className="text-stone-500 dark:text-stone-400 mt-2 text-lg">Visualize how your ideas connect across sections.</p>
          </div>
          <div className="flex w-full max-w-md gap-2 lg:justify-end">
            <input
              type="text"
              value={newSectionName}
              onChange={(event) => setNewSectionName(event.target.value)}
              placeholder="Create new field"
              className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-stone-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
            />
            <button
              type="button"
              onClick={createSectionFromMap}
              className="rounded-xl border border-stone-300 px-4 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-900"
            >
              Add field
            </button>
          </div>
        </div>
      </header>
      
      <div className="flex-1 relative bg-stone-50 dark:bg-stone-950 overflow-hidden" ref={containerRef}>
        <div className="absolute top-6 left-6 z-10 flex flex-col gap-4 pointer-events-none">
          <div className="bg-white/80 dark:bg-stone-900/80 backdrop-blur-md px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-800 text-[10px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400 shadow-xl">
            Scroll to zoom • Drag to pan • Click ideas to open
          </div>
          
          <div className="bg-white/80 dark:bg-stone-900/80 backdrop-blur-md p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-xl flex flex-col gap-3">
            <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 mb-1">Legend</h4>
            <div className="flex items-center gap-3">
              <div className="w-4 h-0.5 bg-stone-300 dark:bg-stone-700" />
              <span className="text-[10px] font-bold text-stone-600 dark:text-stone-400 uppercase tracking-wider">Section Hierarchy</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-0.5 border-t-2 border-dashed border-stone-400 dark:border-stone-600" />
              <span className="text-[10px] font-bold text-stone-600 dark:text-stone-400 uppercase tracking-wider">Cross-Interconnection</span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <div className="w-3 h-3 rounded-full bg-stone-900 dark:bg-stone-100" />
              <span className="text-[10px] font-bold text-stone-600 dark:text-stone-400 uppercase tracking-wider">Section Node</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full border-2 border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900" />
              <span className="text-[10px] font-bold text-stone-600 dark:text-stone-400 uppercase tracking-wider">Idea Node (Size = Maturity)</span>
            </div>
          </div>
        </div>
        <svg ref={svgRef} className="w-full h-full outline-none" />
      </div>
    </div>
  );
}
