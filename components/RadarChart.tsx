
import React from 'react';

interface RadarChartProps {
  data: { label: string; value: number }[];
  size?: number;
}

export const RadarChart: React.FC<RadarChartProps> = ({ data, size = 200 }) => {
  if (!data || data.length < 3) { // Need at least 3 points for a polygon
    return null;
  }

  const count = data.length;
  const center = size / 2;
  const radius = center * 0.7; // Leave some space for labels

  // Calculate points for the data polygon
  const points = data.map((item, i) => {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2; // Start from top
    const value = Math.max(0, Math.min(100, item.value || 0));
    const r = (radius * value) / 100;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid Lines */}
      <g>
        {/* Concentric Polygons */}
        {[0.25, 0.5, 0.75, 1].map(scale => (
          <polygon
            key={scale}
            points={Array.from({ length: count }, (_, i) => {
              const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
              const r = radius * scale;
              const x = center + r * Math.cos(angle);
              const y = center + r * Math.sin(angle);
              return `${x},${y}`;
            }).join(' ')}
            fill="none"
            stroke="#4A5568" // gray-600
            strokeWidth="0.5"
          />
        ))}

        {/* Axes lines from center to edge */}
        {data.map((_, i) => {
          const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
          const x = center + radius * Math.cos(angle);
          const y = center + radius * Math.sin(angle);
          return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="#4A5568" strokeWidth="0.5" />;
        })}
      </g>
      
      {/* Labels */}
      <g>
        {data.map((item, i) => {
            const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
            const r = radius + 15; // Position labels outside the grid
            const x = center + r * Math.cos(angle);
            const y = center + r * Math.sin(angle);
            
            // Basic text anchor logic
            const textAnchor = x < center - 10 ? 'end' : x > center + 10 ? 'start' : 'middle';
            const dominantBaseline = y < center - 10 ? 'alphabetic' : y > center + 10 ? 'hanging' : 'middle';

            return (
                 <text
                    key={item.label}
                    x={x}
                    y={y}
                    fontSize="10"
                    fill="#9CA3AF" // gray-400
                    textAnchor={textAnchor}
                    dominantBaseline={dominantBaseline}
                    fontWeight="bold"
                >
                    {item.label}
                </text>
            );
        })}
      </g>

      {/* Data Shape */}
      <polygon points={points} fill="rgba(99, 102, 241, 0.4)" stroke="#818CF8" strokeWidth="1.5" />
      
       {/* Data points */}
      <g>
        {data.map((item, i) => {
            const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
            const value = Math.max(0, Math.min(100, item.value || 0));
            const r = (radius * value) / 100;
            const x = center + r * Math.cos(angle);
            const y = center + r * Math.sin(angle);
            return <circle key={`${item.label}-point`} cx={x} cy={y} r="3" fill="#A5B4FC" />;
        })}
      </g>
    </svg>
  );
};