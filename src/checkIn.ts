import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

type Friend = { id: string; name: string };
export type CheckIn = { personaId: string; text: string; due: number };
type State = { enabled: boolean; pending?: CheckIn };
const KEY = 'sweettalk:check-in-v1';
const ID = 240104;
const FOUR_DAYS = 4 * 24 * 60 * 60 * 1000;
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const result = queue.then(job, job);
  queue = result.catch(() => {});
  return result;
}
function read(): State {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}');
    const p = value.pending;
    return { enabled: value.enabled === true, pending: p && typeof p.personaId === 'string' && typeof p.text === 'string' && Number.isFinite(p.due) ? p : undefined };
  } catch { return { enabled: false }; }
}
function write(state: State) { localStorage.setItem(KEY, JSON.stringify(state)); }
export function checkInEnabled() { return read().enabled; }
function nextCheckIn(friend: Friend): CheckIn {
  return { personaId: friend.id, text: '잘 지내고 있어? 요즘 하루는 어땠는지 궁금해. 편할 때 이야기해 줘.', due: Date.now() + FOUR_DAYS };
}
async function schedule(friend: Friend, pending: CheckIn) {
  await LocalNotifications.cancel({ notifications: [{ id: ID }] });
  if ((await LocalNotifications.checkPermissions()).display !== 'granted') throw new Error('아이폰 설정에서 SweetTalk 알림을 허용해 주세요.');
  await LocalNotifications.schedule({ notifications: [{ id: ID, title: friend.name.slice(0,60), body: pending.text, schedule: { at: new Date(pending.due) }, extra: { personaId: friend.id } }] });
}
export function setCheckInEnabled(enabled: boolean, friend: Friend) {
  return serial(async () => {
    if (!enabled) {
      if (Capacitor.isNativePlatform()) await LocalNotifications.cancel({ notifications: [{ id: ID }] });
      write({ enabled: false });
      return;
    }
    if (!Capacitor.isNativePlatform()) throw new Error('안부 알림은 설치된 앱에서 사용할 수 있어요.');
    if ((await LocalNotifications.requestPermissions()).display !== 'granted') throw new Error('알림 권한이 허용되지 않았어요.');
    const pending = nextCheckIn(friend);
    await schedule(friend, pending);
    write({ enabled: true, pending });
  });
}
export function recordCheckInActivity(friend: Friend) {
  return serial(async () => {
    const state = read();
    if (!state.enabled) return;
    const pending = nextCheckIn(friend);
    // Save the reset before scheduling so a previous due message cannot be replayed.
    write({ enabled: true, pending });
    await schedule(friend, pending);
  });
}
export function cancelCheckIn(personaId?: string) {
  return serial(async () => {
    const state = read();
    if (personaId && state.pending?.personaId !== personaId) return;
    if (Capacitor.isNativePlatform()) await LocalNotifications.cancel({ notifications: [{ id: ID }] });
    write({ enabled: personaId ? state.enabled : false });
  });
}
export function takeDueCheckIn(): Promise<CheckIn | undefined> {
  return serial(async () => {
    const state = read();
    if (!state.enabled || !state.pending || state.pending.due > Date.now()) return;
    const pending = state.pending;
    write({ enabled: true });
    return pending;
  });
}
export function listenForCheckIn(receive: (open: boolean, personaId?: string) => void) {
  let disposed = false;
  const handles: { remove(): Promise<void> }[] = [];
  if (Capacitor.isNativePlatform()) {
    const add = async () => {
      const received = await LocalNotifications.addListener('localNotificationReceived', notification => { if (notification.id === ID) receive(false); });
      const tapped = await LocalNotifications.addListener('localNotificationActionPerformed', action => { if (action.notification.id === ID) receive(true, action.notification.extra?.personaId); });
      if (disposed) { await received.remove(); await tapped.remove(); } else handles.push(received, tapped);
    };
    void add().catch(() => {});
  }
  return () => { disposed = true; handles.forEach(handle => { void handle.remove(); }); };
}
