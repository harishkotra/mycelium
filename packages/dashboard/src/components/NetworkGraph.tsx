"use client";

import { useEffect, useRef, useState } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { AgentRecord, Subscription, TrustRecord } from "@/lib/types";
import { getTrustForPair } from "@/mock/mockAgents";

interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  factCount: number;
}

interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  trustScore: number;
}

interface Props {
  agents: AgentRecord[];
  subscriptions: Subscription[];
}

export default function NetworkGraph({ agents, subscriptions }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ w: 800, h: 500 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setDim({ w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    const w = dim.w;
    const h = dim.h;

    const nodes: GraphNode[] = agents.map((a) => ({
      id: a.agentId,
      label: a.agentId,
      factCount: a.facts.length,
    }));

    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges: GraphEdge[] = subscriptions
      .filter(
        (s) =>
          s.active &&
          nodeIds.has(s.subscriberId) &&
          nodeIds.has(s.sourceAgentId),
      )
      .map((s) => ({
        source: s.sourceAgentId,
        target: s.subscriberId,
        trustScore: getTrustForPair(s.subscriberId, s.sourceAgentId),
      }));

    const simulation = forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        forceLink<GraphNode, GraphEdge>(edges)
          .id((d) => d.id)
          .distance(120),
      )
      .force("charge", forceManyBody().strength(-300))
      .force("center", forceCenter(w / 2, h / 2))
      .force("collide", forceCollide(30));

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.innerHTML = "";
    svg.appendChild(g);

    const linkGroup = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    const nodeGroup = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    g.appendChild(linkGroup);
    g.appendChild(nodeGroup);

    const linkElements: SVGLineElement[] = edges.map((edge) => {
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      const ts = (edge as GraphEdge).trustScore;
      line.setAttribute(
        "stroke",
        `oklch(${0.3 + ts * 0.5} 0.1 ${120 - ts * 120})`,
      );
      line.setAttribute("stroke-width", String(Math.max(1, ts * 6)));
      line.setAttribute("stroke-opacity", "0.6");
      linkGroup.appendChild(line);
      return line;
    });

    const tooltip = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    tooltip.setAttribute("fill", "#333");
    tooltip.setAttribute("font-size", "12");
    tooltip.setAttribute("text-anchor", "middle");
    tooltip.setAttribute("pointer-events", "none");
    g.appendChild(tooltip);

    const nodeElements: SVGGElement[] = nodes.map((node) => {
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("cursor", "pointer");

      const r = 8 + node.factCount * 4;
      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      circle.setAttribute("r", String(r));
      circle.setAttribute("fill", "#6366f1");
      circle.setAttribute("stroke", "#fff");
      circle.setAttribute("stroke-width", "2");

      const text = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      text.setAttribute("dy", String(r + 14));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "#333");
      text.setAttribute("font-size", "11");
      text.setAttribute("font-weight", "600");
      text.textContent = node.label;

      group.appendChild(circle);
      group.appendChild(text);

      group.addEventListener("mouseenter", () => {
        setHoveredNode(node.id);
        circle.setAttribute("fill", "#f59e0b");
        tooltip.textContent = `${node.label} (${node.factCount} facts, ${edges.filter((e) => (typeof e.source === "object" ? (e.source as GraphNode).id : e.source) === node.id || (typeof e.target === "object" ? (e.target as GraphNode).id : e.target) === node.id).length} connections)`;
        tooltip.setAttribute("opacity", "1");
      });
      group.addEventListener("mouseleave", () => {
        setHoveredNode(null);
        circle.setAttribute("fill", "#6366f1");
        tooltip.setAttribute("opacity", "0");
      });

      group.addEventListener("click", () => {
        window.location.href = `/agent/${node.id}`;
      });

      nodeGroup.appendChild(group);
      const childNodes = group.children;
      return group as unknown as SVGGElement;
    });

    simulation.on("tick", () => {
      linkElements.forEach((line, i) => {
        const edge = edges[i];
        const src = edge.source as GraphNode;
        const tgt = edge.target as GraphNode;
        if (src && tgt) {
          line.setAttribute("x1", String(src.x ?? 0));
          line.setAttribute("y1", String(src.y ?? 0));
          line.setAttribute("x2", String(tgt.x ?? 0));
          line.setAttribute("y2", String(tgt.y ?? 0));
        }
      });

      nodeElements.forEach((group, i) => {
        const node = nodes[i];
        group.setAttribute(
          "transform",
          `translate(${node.x ?? 0},${node.y ?? 0})`,
        );
      });
    });

    return () => {
      simulation.stop();
    };
  }, [dim, agents, subscriptions]);

  return (
    <div
      ref={containerRef}
      className="w-full border border-border rounded-lg overflow-hidden"
      style={{ height: dim.h }}
    >
      <svg ref={svgRef} width={dim.w} height={dim.h} />
    </div>
  );
}
