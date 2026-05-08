import { View, ScrollView } from "react-native";
import { Appbar, Text, Card, Divider, useTheme } from "react-native-paper";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";

export default function HelpScreen() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Help & FAQ" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Section icon="wallet-outline" title="Available to Spend">
          Your "Available to Spend" is calculated as:
          {'\n\n'}
          <Bold>Total Balance</Bold> = Initial Balance + Income − Expenses
          {'\n\n'}
          <Bold>Reserved</Bold> = Budget Reserves + Savings Accumulated
          {'\n\n'}
          <Bold>Available</Bold> = Total Balance − Reserved
          {'\n\n'}
          This means budgets immediately reserve their full amount until you spend against them. Savings goals reserve whatever you've accumulated so far.
        </Section>

        <Section icon="chart-donut" title="Budgets">
          Budgets are spending plans with a name and amount. They are not tied to a specific category — you can name them anything (e.g., "Groceries", "Rent", "Fun Money").
          {'\n\n'}
          You may optionally assign a category to a budget. This enables automatic matching: any expense transaction in that category that isn't explicitly linked to another budget will count toward this budget.
          {'\n\n'}
          To track spending against a budget, link a transaction to it when creating or editing the transaction.
        </Section>

        <Section icon="piggy-bank-outline" title="Savings Goals">
          Savings goals track progress toward a target amount. You can optionally assign a category — when you deposit, the transaction will use that category (or "Savings" / "Others" as fallback).
          {'\n\n'}
          Depositing to a savings goal creates an expense transaction. This reduces your total balance while increasing your savings reserve, so the effect on available balance is doubled. This is intentional: the money has left your spending pool and is set aside.
          {'\n\n'}
          You can also transfer unused budget allocation to a savings goal. This reallocates without moving actual money.
        </Section>

        <Section icon="calendar-check-outline" title="Agendas & Reminders">
          Agendas are reminders for upcoming financial events. Linking a budget to an agenda does NOT deduct from your balance — it only associates the reminder so that when you record it as a transaction, the expense automatically tracks against that budget.
          {'\n\n'}
          If an agenda has no amount, you cannot record it as a transaction. You must set an amount first.
        </Section>

        <Section icon="transfer" title="Transfer Budget to Savings">
          This reduces your budget limit and increases your savings progress in one step. No transaction is created, so your total balance stays the same. The available balance also stays the same — the budget reserve decreases by the same amount the savings reserve increases.
        </Section>

        <Section icon="help-circle-outline" title="Common Questions">
          <Bold>Q: Why did my available balance drop when I created a budget?</Bold>
          {'\n'}
          Budgets pre-reserve their full amount. As you spend against the budget, the reserve releases dollar-for-dollar, so your available balance stays steady through the month.
          {'\n\n'}
          <Bold>Q: Why does depositing to savings reduce my available balance by double?</Bold>
          {'\n'}
          The deposit creates an expense (money leaves your wallet) AND increases your savings reserve (the accumulated savings is set aside). Both effects together mean available balance drops by 2×. This is correct: the cash is gone from your pocket and committed to your goal.
          {'\n\n'}
          <Bold>Q: Does linking a budget to an agenda affect my balance?</Bold>
          {'\n'}
          No. The link is just a reference. Only when you record the agenda as a transaction does the expense count against the budget.
          {'\n\n'}
          <Bold>Q: What if I don't assign a category to my budget?</Bold>
          {'\n'}
          The budget will only track transactions that are explicitly linked to it via the "Link to Budget" option. It won't automatically pick up transactions by category.
          {'\n\n'}
          <Bold>Q: How do I see where my available balance comes from?</Bold>
          {'\n'}
          Tap the "Total" or "Reserved" badges on the dashboard card to open the Balance Breakdown.
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Card style={{ marginBottom: 16, borderRadius: 12 }}>
      <Card.Content>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <MaterialCommunityIcons name={icon as any} size={22} color={theme.colors.primary} />
          <Text variant="titleMedium" style={{ fontWeight: "700", marginLeft: 8 }}>{title}</Text>
        </View>
        <Divider style={{ marginBottom: 12 }} />
        <Text variant="bodyMedium" style={{ lineHeight: 22 }}>
          {children}
        </Text>
      </Card.Content>
    </Card>
  );
}

function Bold({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontWeight: "700" }}>{children}</Text>;
}
