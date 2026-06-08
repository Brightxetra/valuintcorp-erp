type LogLevel = "info" | "warn" | "error";

interface LogPayload {
  businessId?: string;
  userId?: string;
  route?: string;
  action?: string;
  status?: string;
  details?: Record<string, unknown>;
}

function writeStructuredLog(level: LogLevel, event: string, payload: LogPayload = {}) {
  const entry = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...payload,
  };
  const serialized = JSON.stringify(entry);

  if (level === "error") {
    console.error(serialized);
  } else if (level === "warn") {
    console.warn(serialized);
  } else {
    console.info(serialized);
  }
}

export function logApiInfo(event: string, payload?: LogPayload) {
  writeStructuredLog("info", event, payload);
}

export function logApiWarning(event: string, payload?: LogPayload) {
  writeStructuredLog("warn", event, payload);
}

export function logApiError(event: string, error: unknown, payload: LogPayload = {}) {
  writeStructuredLog("error", event, {
    ...payload,
    details: {
      ...payload.details,
      error: error instanceof Error ? error.message : String(error),
    },
  });
}
