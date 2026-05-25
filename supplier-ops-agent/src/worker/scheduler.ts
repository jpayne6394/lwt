export type ScheduledTask = () => Promise<void>;

export function startWeeklyScheduler(task: ScheduledTask, intervalMs = 7 * 24 * 60 * 60 * 1000) {
  let running = false;
  const timer = setInterval(() => {
    if (running) {
      return;
    }
    running = true;
    task()
      .catch((error) => {
        console.error("Weekly supplier sync failed", error);
      })
      .finally(() => {
        running = false;
      });
  }, intervalMs);

  return {
    stop() {
      clearInterval(timer);
    },
  };
}

