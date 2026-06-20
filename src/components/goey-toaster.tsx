"use client";

import { GooeyToaster } from "goey-toast";

export function AppToaster() {
  return (
    <GooeyToaster
      position="bottom-right"
      offset={16}
      gap={14}
      theme="light"
      duration={5000}
      preset="subtle"
      visibleToasts={3}
      closeButton="top-right"
      closeOnEscape
      swipeToDismiss
      maxQueue={3}
      queueOverflow="drop-oldest"
      showProgress
      showTimestamp={false}
    />
  );
}
