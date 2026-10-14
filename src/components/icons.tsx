import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/lib/theme';

type Props = { size?: number; color?: string; strokeWidth?: number };

function base({ size = 22, color = colors.ink, strokeWidth = 2.5 }: Props) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

export const BackIcon = (p: Props) => (
  <Svg {...base(p)}><Path d="M15 18l-6-6 6-6" /></Svg>
);
export const ChevronIcon = (p: Props) => (
  <Svg {...base(p)}><Path d="M9 18l6-6-6-6" /></Svg>
);
export const CloseIcon = (p: Props) => (
  <Svg {...base({ strokeWidth: 3, ...p })}><Path d="M6 6l12 12M18 6L6 18" /></Svg>
);
export const PlusIcon = (p: Props) => (
  <Svg {...base({ strokeWidth: 3.5, ...p })}><Path d="M12 4v16M4 12h16" /></Svg>
);
export const CheckIcon = (p: Props) => (
  <Svg {...base({ strokeWidth: 3.5, ...p })}><Path d="M5 12l5 5 9-10" /></Svg>
);
export const PinIcon = (p: Props) => (
  <Svg {...base(p)}>
    <Path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
    <Circle cx="12" cy="10" r="2.5" />
  </Svg>
);
export const HomeIcon = (p: Props) => (
  <Svg {...base(p)}><Path d="M4 11l8-7 8 7v9H4z" /></Svg>
);
export const PeopleIcon = (p: Props) => (
  <Svg {...base({ strokeWidth: 2.2, ...p })}>
    <Circle cx="9" cy="9" r="3.5" />
    <Circle cx="17" cy="10" r="2.5" />
    <Path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M15 15.5c3 0 5.5 1.8 5.5 4.5" />
  </Svg>
);
/** Crews: little groups of people. */
export const CrewsIcon = (p: Props) => (
  <Svg {...base({ strokeWidth: 2.2, ...p })}>
    <Circle cx="12" cy="6.5" r="3" />
    <Circle cx="6" cy="16" r="3" />
    <Circle cx="18" cy="16" r="3" />
    <Path d="M10.2 9l-2.4 4.4M13.8 9l2.4 4.4M9 16h6" />
  </Svg>
);
export const AddPersonIcon = (p: Props) => (
  <Svg {...base(p)}>
    <Circle cx="9" cy="8" r="3.5" />
    <Path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M19 8v6M16 11h6" />
  </Svg>
);
export const CameraIcon = (p: Props) => (
  <Svg {...base({ strokeWidth: 2, ...p })}>
    <Path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <Circle cx="12" cy="13" r="3.5" />
  </Svg>
);
export const ShareIcon = (p: Props) => (
  <Svg {...base(p)}><Path d="M4 12v7h16v-7M12 3v12M7 8l5-5 5 5" /></Svg>
);
export const ClashIcon = (p: Props) => (
  <Svg {...base(p)}>
    <Rect x="3" y="5" width="18" height="16" rx="3" />
    <Path d="M3 10h18M8 3v4M16 3v4M9.5 14.5l5 5M14.5 14.5l-5 5" />
  </Svg>
);
