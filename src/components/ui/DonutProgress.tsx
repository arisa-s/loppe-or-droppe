import Svg, { Circle } from "react-native-svg";

type Props = {
  answered: number;
  total: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
};

/**
 * Tiny circular progress donut.
 * Shows answered / total as an arc, starting from the top (−90°).
 */
export default function DonutProgress({
  answered,
  total,
  size = 18,
  strokeWidth = 2.5,
  color = "#404040",
  trackColor = "#e5e5e5",
}: Props) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = total === 0 ? 0 : Math.min(answered / total, 1);
  const dash = progress * circumference;
  const gap = circumference - dash;
  const center = size / 2;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* track */}
      <Circle
        cx={center}
        cy={center}
        r={r}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="none"
      />
      {/* arc */}
      {progress > 0 ? (
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={[dash, gap]}
          strokeLinecap="round"
          rotation={-90}
          origin={`${center}, ${center}`}
        />
      ) : null}
    </Svg>
  );
}
