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
          <Bold>Reserved</Bold> = Savings Accumulated
          {'\n\n'}
          <Bold>Available</Bold> = Total Balance − Reserved
          {'\n\n'}
          Only savings lock your money. Dues (scheduled reminders) forecast upcoming needs but do not reserve your balance.
        </Section>

        <Section icon="calendar-check-outline" title="Dues">
          Dues are scheduled financial events — bills, payroll, subscriptions. They can be one-time or recurring (weekly, monthly, yearly).
          {'\n\n'}
          <Bold>Expense dues</Bold> represent money going out (bills, subscriptions).
          {'\n\n'}
          <Bold>Income dues</Bold> represent money coming in (payroll, freelance).
          {'\n\n'}
          When a due date arrives, you can record it as a transaction with one tap. Enable <Bold>Auto-Process</Bold> to be prompted to auto-create the transaction.
        </Section>

        <Section icon="piggy-bank-outline" title="Savings">
          Savings are locked pots of money. Transfer money in from your main balance to save, or transfer out to unlock it.
          {'\n\n'}
          <Bold>Transfer In</Bold> creates an expense transaction — money leaves your available balance and enters savings.
          {'\n\n'}
          <Bold>Transfer Out</Bold> creates an income transaction — money returns to your available balance.
          {'\n\n'}
          Deleting a savings item automatically transfers its full balance back to your main funds.
        </Section>

        <Section icon="help-circle-outline" title="Common Questions">
          <Bold>Q: Why did my available balance drop when I added to savings?</Bold>
          {'\n'}
          Transferring to savings creates an expense (money leaves your wallet) and locks it in savings. Both effects reduce available balance. This is correct: the cash is set aside.
          {'\n\n'}
          <Bold>Q: Do dues affect my available balance?</Bold>
          {'\n'}
          No. Dues are scheduled reminders only. They forecast upcoming financial events but do not reserve your balance. Only when you record a due as a transaction does your balance change.
          {'\n\n'}
          <Bold>Q: What happens to my savings when I delete a savings item?</Bold>
          {'\n'}
          The full balance is automatically transferred back to your main funds as an income transaction.
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
