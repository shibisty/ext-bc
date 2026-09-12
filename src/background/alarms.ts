import { api } from "../shared/api";
import { readState } from "../shared/storage";

export const ALARM_NAME = "bsc-periodic-check";

/** Re-arms the periodic alarm; an interval of 0 (or less) means "off". */
export async function setupAlarm(): Promise<void> {
  const state = await readState();
  await api.alarms.clear(ALARM_NAME);
  if (!state.intervalMinutes || state.intervalMinutes <= 0) return;
  api.alarms.create(ALARM_NAME, { periodInMinutes: state.intervalMinutes });
}
