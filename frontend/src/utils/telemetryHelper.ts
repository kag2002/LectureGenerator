import client from '../api/client';

interface TelemetryEvent {
  course_id?: number;
  event_type: string;
  element_id?: string;
  payload?: Record<string, any>;
}

interface AIFeedback {
  course_id?: number;
  chapter_id?: number;
  clo_id?: number;
  bloom_level?: number;
  prompt: string;
  proposed_content: string;
  edited_content?: string;
  rating?: number;
  feedback?: string;
}

// Queue in memory for buffering events
let eventQueue: TelemetryEvent[] = [];
let batchTimeout: NodeJS.Timeout | null = null;
const BATCH_INTERVAL_MS = 20000; // 20 seconds batching

/**
 * Flush events to backend api
 */
export async function flushEvents() {
  if (eventQueue.length === 0) return;

  const eventsToSend = [...eventQueue];
  eventQueue = []; // Clear queue immediately to avoid race conditions

  if (batchTimeout) {
    clearTimeout(batchTimeout);
    batchTimeout = null;
  }

  try {
    await client.post('/api/telemetry/events', { events: eventsToSend });
  } catch (error) {
    console.error('[Telemetry] Failed to flush events:', error);
    // Restore events back to queue if failed, to try again next time (max queue size 500)
    if (eventQueue.length < 500) {
      eventQueue = [...eventsToSend, ...eventQueue].slice(0, 500);
    }
  }
}

/**
 * Track user interactions (click, edit, page views) with batching and debouncing
 */
export function trackEvent(
  eventType: string,
  elementId?: string,
  payload?: Record<string, any>,
  courseId?: number
) {
  // Try to enrich payload with basic browser stats
  const enrichedPayload = {
    ...payload,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    screenResolution: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'unknown',
    timestamp: new Date().toISOString(),
  };

  eventQueue.push({
    course_id: courseId,
    event_type: eventType,
    element_id: elementId,
    payload: enrichedPayload,
  });

  // Schedule next batch push if not already scheduled
  if (!batchTimeout) {
    batchTimeout = setTimeout(flushEvents, BATCH_INTERVAL_MS);
  }
}

/**
 * Track an individual click event
 */
export function trackClick(elementId: string, courseId?: number, extraPayload?: Record<string, any>) {
  trackEvent('click', elementId, extraPayload, courseId);
}

/**
 * Track AI generation feedback (SFT data generation)
 * Feedback is sent immediately (no batching) to ensure SFT data is saved safely
 */
export async function trackAIFeedback(feedback: AIFeedback) {
  try {
    await client.post('/api/telemetry/feedback', feedback);
  } catch (error) {
    console.error('[Telemetry] Failed to submit AI feedback:', error);
  }
}

// Automatically flush events when page hides / unloads to avoid losing telemetry data
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    flushEvents();
  });
  window.addEventListener('beforeunload', () => {
    flushEvents();
  });
}
