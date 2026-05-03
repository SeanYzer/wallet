import { useTransactions } from "./useTransactions";
import { useBudgets } from "./useBudgets";
import { useSavings } from "./useSavings";
import { useAgenda } from "./useAgenda";
import { useCurrency } from "../context/CurrencyContext";

export interface Insight {
  id: string;
  type: "warning" | "info" | "success" | "danger";
  title: string;
  message: string;
  category?: string;
}

export function useInsights() {
  const { transactions } = useTransactions();
  const { budgets } = useBudgets();
  const { goals } = useSavings();
  const { agendas } = useAgenda();
  const { formatAmount } = useCurrency();

  const insights: Insight[] = [];
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;
  const monthProgress = dayOfMonth / daysInMonth;
  const currentWeek = Math.ceil(dayOfMonth / 7);

  // 1. Budget Insights
  budgets.forEach((budget) => {
    if (budget.month !== currentMonth) return;

    const spent = transactions
      .filter((t) => {
        if (t.type !== "expense") return false;
        if (t.budgetId && t.budgetId !== budget.id) return false;
        if (t.budgetId === budget.id) return true;
        const txMonth = t.date.slice(0, 7);
        return t.category.id.toString() === budget.categoryId.toString() && txMonth === budget.month;
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const percentage = spent / budget.amount;

    if (spent > budget.amount) {
      insights.push({
        id: `budget-over-${budget.id}`,
        type: "danger",
        title: "Overbudget Alert",
        message: `You've exceeded your budget for this category by ${formatAmount(spent - budget.amount)}.`,
      });
    } else if (percentage > 0.9) {
      insights.push({
        id: `budget-near-${budget.id}`,
        type: "warning",
        title: "Budget Running Low",
        message: `You've used ${Math.round(percentage * 100)}% of this category's budget. Only ${formatAmount(budget.amount - spent)} left.`,
      });
    } else if (percentage > monthProgress + 0.15) {
      insights.push({
        id: `budget-pace-${budget.id}`,
        type: "info",
        title: "Spending Fast",
        message: `You've used ${Math.round(percentage * 100)}% of your budget, but we're only on day ${dayOfMonth} of the month (${daysRemaining} days left). Consider slowing down.`,
      });
    }
  });

  // 2. Savings Insights
  goals.forEach((goal) => {
    const progress = goal.currentAmount / goal.targetAmount;
    if (progress >= 1) {
        insights.push({
            id: `goal-done-${goal.id}`,
            type: "success",
            title: "Goal Reached! 🎉",
            message: `Congratulations! You've reached your target for "${goal.title}".`,
        });
    } else if (progress > 0.8) {
      insights.push({
        id: `goal-near-${goal.id}`,
        type: "success",
        title: "Almost There!",
        message: `You're ${Math.round(progress * 100)}% of the way to your "${goal.title}" goal. Keep it up!`,
      });
    }
  });

  // 3. Agenda Insights
  const upcomingReminders = agendas.filter(a => {
    if (a.completed) return false;
    const dueDate = new Date(a.date);
    const timeDiff = dueDate.getTime() - now.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    return daysDiff >= 0 && daysDiff <= 3;
  });

  upcomingReminders.forEach(reminder => {
    const dueDate = new Date(reminder.date);
    const isToday = dueDate.toDateString() === now.toDateString();
    const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

    insights.push({
      id: `agenda-near-${reminder.id}`,
      type: reminder.type === "income" ? "success" : "warning",
      title: isToday ? "Due Today" : "Upcoming Reminder",
      message: `${reminder.title} (${formatAmount(reminder.amount || 0)}) is ${isToday ? "due today" : `due in ${daysUntil} day(s)`}. ${reminder.type === "income" ? "Get ready for a payday!" : "Plan your spending accordingly."}`,
    });
  });

  // 4. General Insights
  const totalExpenseThisMonth = transactions
    .filter(t => t.type === "expense" && t.date.slice(0, 7) === currentMonth)
    .reduce((sum, t) => sum + t.amount, 0);
  
  if (totalExpenseThisMonth > 0 && budgets.length === 0) {
    insights.push({
        id: 'no-budgets',
        type: 'info',
        title: 'Financial Tip',
        message: 'Setting up budgets for your top categories can help you save up to 20% more each month.'
    });
  }

  return { insights };
}
