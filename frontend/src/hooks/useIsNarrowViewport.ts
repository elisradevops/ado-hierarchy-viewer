import { useEffect, useState } from 'react';
import { NARROW_VIEWPORT_PX } from '../constants/ui';

/** True when the viewport (or ADO extension iframe) is narrower than the breakpoint. */
export function useIsNarrowViewport(breakpointPx: number = NARROW_VIEWPORT_PX): boolean {
  const [isNarrow, setIsNarrow] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < breakpointPx
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const onChange = (e: MediaQueryListEvent): void => setIsNarrow(e.matches);
    setIsNarrow(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [breakpointPx]);

  return isNarrow;
}
