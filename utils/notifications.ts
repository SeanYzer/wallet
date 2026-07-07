import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { Due, DueFrequency } from "../types";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

function getNextDueDate(dateStr: string, frequency: DueFrequency): Date | null {
  const dueDate = new Date(dateStr);
  const now = new Date();

  if (frequency === "once") {
    return dueDate > now ? dueDate : null;
  }

  const next = new Date(dueDate);
  while (next <= now) {
    switch (frequency) {
      case "daily":
        next.setDate(next.getDate() + 1);
        break;
      case "weekly":
        next.setDate(next.getDate() + 7);
        break;
      case "biweekly":
        next.setDate(next.getDate() + 14);
        break;
      case "monthly":
        next.setMonth(next.getMonth() + 1);
        break;
      case "yearly":
        next.setFullYear(next.getFullYear() + 1);
        break;
    }
  }
  return next;
}

export async function scheduleDueNotifications(dues: Due[]): Promise<void> {
  if (Platform.OS === "web") return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = new Date();
  const upcoming = dues.filter((d) => !d.completed);

  for (const due of upcoming) {
    const nextDate = getNextDueDate(due.date, due.frequency || "once");
    if (!nextDate) continue;

    const diffMs = nextDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 30) continue;

    const triggerDate = new Date(nextDate);
    triggerDate.setHours(9, 0, 0, 0);

    if (triggerDate <= now) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: due.type === "expense" ? "📄 Bill Due" : "💰 Income Due",
        body: `${due.title} — ${due.type === "expense" ? "-" : "+"}₱${due.amount.toFixed(2)}`,
        data: { dueId: due.id, screen: "dues" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });
  }
}

export async function cancelAllNotifications(): Promise<void> {
  if (Platform.OS === "web") return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}
