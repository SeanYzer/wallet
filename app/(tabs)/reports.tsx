import { useState, useCallback } from "react";
import { View, ScrollView, Dimensions } from "react-native";
import { Appbar, Text, Card, useTheme, Button, Menu, Divider, IconButton } from "react-native-paper";
import { useRouter, useFocusEffect } from "expo-router";
import { BarChart, PieChart } from "react-native-chart-kit";
import { useTransactions } from "../../hooks/useTransactions";
import { useCurrency } from "../../context/CurrencyContext";
import { PaymentMethodChart } from "../../components/PaymentMethodChart";
import { exportToCSV, exportToPDF } from "../../utils/exportUtils";
import { isWithinInterval, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from "date-fns";

export default function ReportsScreen() {
  const theme = useTheme();
  const { transactions = [], refetch } = useTransactions();
  const { formatAmount, currency } = useCurrency();
  const screenWidth = Dimensions.get("window").width;

  const [period, setPeriod] = useState<"weekly" | "monthly" | "annually" | "all">("monthly");
  const [menuVisible, setMenuVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [])
  );

  const getFilteredData = () => {
    const now = new Date();
    let start: Date, end: Date;

    switch (period) {
      case "weekly":
        start = startOfWeek(now);
        end = endOfWeek(now);
        break;
      case "monthly":
        start = startOfMonth(now);
        end = endOfMonth(now);
        break;
      case "annually":
        start = startOfYear(now);
        end = endOfYear(now);
        break;
      default:
        return transactions;
    }

    return transactions.filter(t => {
      const d = new Date(t.date);
      return isWithinInterval(d, { start, end });
    });
  };

  const filteredTransactions = getFilteredData();
  const income = filteredTransactions.filter(t => t.type === "income").reduce((sum, t) => sum + (t.amount || 0), 0);
  const expense = filteredTransactions.filter(t => t.type === "expense").reduce((sum, t) => sum + (t.amount || 0), 0);

  const pieData = [
    {
      name: "Income",
      population: income,
      color: "#4CAF50",
      legendFontColor: "#7F7F7F",
      legendFontSize: 12
    },
    {
      name: "Expense",
      population: expense,
      color: "#F44336",
      legendFontColor: "#7F7F7F",
      legendFontSize: 12
    }
  ];

  // Group by category for Category Pie Chart
  const categoryDataMap = filteredTransactions
    .filter(t => t.type === "expense")
    .reduce((acc: any, t) => {
      const cat = t.category.name;
      acc[cat] = (acc[cat] || 0) + t.amount;
      return acc;
    }, {});

  const COLORS = ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF", "#FF9F40"];
  const categoryPieData = Object.keys(categoryDataMap).map((cat, i) => ({
    name: cat,
    population: categoryDataMap[cat],
    color: COLORS[i % COLORS.length],
    legendFontColor: "#7F7F7F",
    legendFontSize: 11
  }));

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background, elevation: 0 }}>
        <Appbar.Content title="Financial Reports" titleStyle={{ fontWeight: "700" }} />
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <Button 
                mode="outlined" 
                onPress={() => setMenuVisible(true)} 
                icon="calendar-range"
                style={{ marginRight: 8 }}
            >
              {period.toUpperCase()}
            </Button>
          }
        >
          <Menu.Item onPress={() => { setPeriod("weekly"); setMenuVisible(false); }} title="Weekly" />
          <Menu.Item onPress={() => { setPeriod("monthly"); setMenuVisible(false); }} title="Monthly" />
          <Menu.Item onPress={() => { setPeriod("annually"); setMenuVisible(false); }} title="Annually" />
          <Menu.Item onPress={() => { setPeriod("all"); setMenuVisible(false); }} title="All Time" />
        </Menu>
      </Appbar.Header>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
          <Card style={{ flex: 1, marginRight: 8, backgroundColor: "#E8F5E9" }}>
            <Card.Content>
              <Text variant="labelSmall" style={{ color: "#2E7D32" }}>Total Income</Text>
              <Text variant="titleLarge" style={{ color: "#2E7D32", fontWeight: "700" }}>{formatAmount(income)}</Text>
            </Card.Content>
          </Card>
          <Card style={{ flex: 1, marginLeft: 8, backgroundColor: "#FFEBEE" }}>
            <Card.Content>
              <Text variant="labelSmall" style={{ color: "#C62828" }}>Total Expense</Text>
              <Text variant="titleLarge" style={{ color: "#C62828", fontWeight: "700" }}>{formatAmount(expense)}</Text>
            </Card.Content>
          </Card>
        </View>

        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 16, fontWeight: "700" }}>Income vs Expense</Text>
            {income === 0 && expense === 0 ? (
                <View style={{ height: 200, justifyContent: "center", alignItems: "center" }}>
                    <Text variant="bodyMedium" style={{ color: "gray" }}>No data for this period</Text>
                </View>
            ) : (
                <PieChart
                    data={pieData}
                    width={screenWidth - 64}
                    height={200}
                    chartConfig={{
                        color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                    }}
                    accessor={"population"}
                    backgroundColor={"transparent"}
                    paddingLeft={"15"}
                    center={[10, 0]}
                    absolute
                />
            )}
          </Card.Content>
        </Card>

        {categoryPieData.length > 0 && (
          <Card style={{ marginBottom: 16 }}>
            <Card.Content>
              <Text variant="titleMedium" style={{ marginBottom: 16, fontWeight: "700" }}>Expense by Category</Text>
              <PieChart
                data={categoryPieData}
                width={screenWidth - 64}
                height={200}
                chartConfig={{
                  color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                }}
                accessor={"population"}
                backgroundColor={"transparent"}
                paddingLeft={"15"}
                center={[10, 0]}
                absolute
              />
            </Card.Content>
          </Card>
        )}

        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 12, fontWeight: "700" }}>Export Data</Text>
            <Text variant="bodySmall" style={{ color: "gray", marginBottom: 16 }}>
              Download your transaction history for the selected period.
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Button
                mode="contained-tonal"
                icon="file-excel"
                onPress={() => exportToCSV(filteredTransactions)}
                style={{ flex: 1 }}
              >
                CSV
              </Button>
              <Button
                mode="contained-tonal"
                icon="file-pdf-box"
                onPress={() => exportToPDF(filteredTransactions, formatAmount)}
                style={{ flex: 1 }}
              >
                PDF
              </Button>
            </View>
          </Card.Content>
        </Card>

        <PaymentMethodChart transactions={filteredTransactions} />
      </ScrollView>
    </View>
  );
}
