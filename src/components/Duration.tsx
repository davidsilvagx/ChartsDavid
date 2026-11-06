import { createContext, useContext } from 'react';
import { formatWeeks, type DurationMode } from '../lib/duration';
export const DurationContext = createContext<DurationMode>('weeks');
export function Duration({ weeks }: { weeks: number }) { return <>{formatWeeks(weeks, useContext(DurationContext))}</>; }
