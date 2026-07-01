"use client";

import { useEffect, useRef } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { AgentRecord, Subscription } from "@/lib/types";
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

const W = 960;
const H = 600;

export default function NetworkGraph({ agents, subscriptions }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

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

    // Stable coordinate system — W × H viewBox, scale with CSS
    const sim = forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        forceLink<GraphNode, GraphEdge>(edges)
          .id((d) => d.id)
          .distance(140),
      )
      .force("charge", forceManyBody().strength(-400))
      .force("center", forceCenter(W / 2, H / 2))
      .force("collide", forceCollide(40));

    // Build SVG once
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

    const linkEls: SVGLineElement[] = edges.map((edge) => {
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

    const nodeEls: SVGGElement[] = nodes.map((node) => {
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
      text.setAttribute("font-size", "12");
      text.setAttribute("font-weight", "600");
      text.textContent = node.label;

      group.appendChild(circle);
      group.appendChild(text);

      group.addEventListener("mouseenter", () => {
        circle.setAttribute("fill", "#f59e0b");
      });
      group.addEventListener("mouseleave", () => {
        circle.setAttribute("fill", "#6366f1");
      });
      group.addEventListener("click", () => {
        window.location.href = `/agent/${node.id}`;
      });

      nodeGroup.appendChild(group);
      return group as unknown as SVGGElement;
    });

    sim.on("tick", () => {
      linkEls.forEach((line, i) => {
        const e = edges[i];
        const src = e.source as GraphNode;
        const tgt = e.target as GraphNode;
        if (src && tgt) {
          line.setAttribute("x1", String(src.x ?? 0));
          line.setAttribute("y1", String(src.y ?? 0));
          line.setAttribute("x2", String(tgt.x ?? 0));
          line.setAttribute("y2", String(tgt.y ?? 0));
        }
      });
      nodeEls.forEach((group, i) => {
        const n = nodes[i];
        group.setAttribute("transform", `translate(${n.x ?? 0},${n.y ?? 0})`);
      });
    });

    return () => {
      sim.stop();
    };
  }, [agents, subscriptions]);

  return (
    <div
      ref={containerRef}
      className="w-full border border-border rounded-lg overflow-hidden"
      style={{ minHeight: 400 }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      />
    </div>
  );
}
