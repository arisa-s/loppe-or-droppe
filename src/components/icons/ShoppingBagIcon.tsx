import Svg, { Path } from "react-native-svg";

type Props = {
  size?: number;
  color?: string;
  filled?: boolean;
};

/** Shopping bag — Heroicons 2.0 outline/solid, MIT. */
export default function ShoppingBagIcon({
  size = 24,
  color = "#404040",
  filled = false,
}: Props) {
  if (filled) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <Path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M7.5 6v.75H5.513c-.96 0-1.764.724-1.865 1.679l-1.263 12A1.875 1.875 0 004.25 22.5h15.5a1.875 1.875 0 001.865-2.071l-1.263-12a1.875 1.875 0 00-1.865-1.679H16.5V6a4.5 4.5 0 10-9 0zm4.5-2.25a2.25 2.25 0 00-2.25 2.25v.75h4.5V6A2.25 2.25 0 0012 3.75zm-1.875 9a1.875 1.875 0 113.75 0 1.875 1.875 0 01-3.75 0z"
        />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
