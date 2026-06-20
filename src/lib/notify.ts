"use client";

import {
  gooeyToast,
  type GooeyPromiseData,
  type GooeyToastOptions,
} from "goey-toast";

const SUCCESS_DURATION = 5_000;
const ERROR_DURATION = 8_000;
const DEDUPE_WINDOW = 1_000;

type NotificationOptions = GooeyToastOptions & {
  dedupeKey?: string;
};

const recentNotifications = new Map<string, number>();

function shouldNotify(type: string, title: string, options: NotificationOptions) {
  const key = options.dedupeKey ?? `${type}:${title}:${String(options.description ?? "")}`;
  const now = Date.now();
  const lastShown = recentNotifications.get(key);

  recentNotifications.set(key, now);

  for (const [entry, timestamp] of recentNotifications) {
    if (now - timestamp > DEDUPE_WINDOW) recentNotifications.delete(entry);
  }

  return !lastShown || now - lastShown >= DEDUPE_WINDOW;
}

function withDuration(options: NotificationOptions, duration: number) {
  const toastOptions = { ...options };
  delete toastOptions.dedupeKey;
  delete toastOptions.duration;
  return { ...toastOptions, duration } satisfies GooeyToastOptions;
}

function show(
  type: "success" | "error" | "info" | "warning",
  title: string,
  options: NotificationOptions = {},
) {
  if (!shouldNotify(type, title, options)) return undefined;

  const duration = type === "error" ? ERROR_DURATION : SUCCESS_DURATION;
  return gooeyToast[type](title, withDuration(options, duration));
}

export const notify = {
  success: (title: string, options?: NotificationOptions) => show("success", title, options),
  error: (title: string, options?: NotificationOptions) => show("error", title, options),
  info: (title: string, options?: NotificationOptions) => show("info", title, options),
  warning: (title: string, options?: NotificationOptions) => show("warning", title, options),
  promise: <T,>(promise: Promise<T>, data: GooeyPromiseData<T>) => gooeyToast.promise(promise, data),
  dismiss: gooeyToast.dismiss,
  update: gooeyToast.update,
};

export const notificationDurations = {
  success: SUCCESS_DURATION,
  error: ERROR_DURATION,
} as const;
