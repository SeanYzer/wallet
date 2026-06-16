import { useState, useEffect } from "react";
import { View, ScrollView, Platform, Alert, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import {
  TextInput,
  Button,
  Text,
  Chip,
  SegmentedButtons,
  useTheme,
  Portal,
  Modal,
  IconButton,
  Appbar,
  Card,
} from "react-native-paper";
import { useRouter } from "expo-router";
import { authFetch } from "../utils/apiClient";
import * as ImagePicker from "expo-image-picker";
import { Calendar } from "react-native-calendars";
import { useTransactions } from "../hooks/useTransactions";
import { Category, TransactionType, PaymentMethod } from "../types";
import { useCategoriesData } from "../context/CategoriesContext";
import { useCurrencyActions } from "../context/CurrencyContext";

export default function AddTransaction() {
  const router = useRouter();
  const { transactions, addTransaction } = useTransactions();
  const { categories: availableCategories } = useCategoriesData();

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [establishment, setEstablishment] = useState("");
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [date, setDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [loading, setLoading] = useState(false);

  const { formatAmount } = useCurrencyActions();

  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<{ id: string; name: string; type: string; icon: string }[]>([]);
  const [selectedMethodType, setSelectedMethodType] = useState<string>("cash");

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const { ok, data } = await authFetch(`paymentMethods`);
      if (ok && data) {
        setAvailablePaymentMethods(data);
        if (data.length > 0) {
          setPaymentMethod(data[0].name);
        }
      }
    } catch (error) {
      console.error("Error fetching payment methods:", error);
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowCalendar(false);
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!result.canceled) {
      setReceiptImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      alert("Camera permission is required to take photos.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!result.canceled) {
      setReceiptImage(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount greater than 0.");
      return;
    }
    if (!selectedCategory) {
      Alert.alert("Category Required", "Please select a category.");
      return;
    }

    setLoading(true);
    try {
      await addTransaction({
        amount: numAmount,
        date: date.toISOString(),
        note: note,
        type,
        category: selectedCategory,
        paymentMethod,
        establishment: establishment || undefined,
        receiptUrl: receiptImage || undefined,
        updatedAt: Date.now(),
      });

      router.back();
    } catch (error) {
      Alert.alert("Error", "Failed to save transaction. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Add Transaction" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <SegmentedButtons
          value={type}
          onValueChange={(val) => {
            setType(val as TransactionType);
            setSelectedCategory(null);
          }}
          buttons={[
            { value: "expense", label: "Expense", icon: "arrow-down" },
            { value: "income", label: "Income", icon: "arrow-up" },
          ]}
          style={{ marginBottom: 16 }}
        />

        <TextInput
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          mode="outlined"
          left={<TextInput.Affix text="₱" />}
          style={{ marginBottom: 16 }}
        />

        <TextInput
          label="Date"
          value={date.toLocaleDateString()}
          mode="outlined"
          editable={false}
          right={<TextInput.Icon icon="calendar" onPress={() => setShowCalendar(true)} />}
          style={{ marginBottom: 16 }}
        />

        <Text variant="labelLarge" style={{ marginBottom: 8 }}>Category</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {availableCategories
            .filter((cat: Category) => cat.type === type)
            .map((cat: Category) => (
              <Chip
                key={cat.id}
                selected={selectedCategory?.id === cat.id}
                onPress={() => setSelectedCategory(cat)}
                mode="outlined"
                selectedColor={selectedCategory?.id === cat.id ? "#6200ee" : undefined}
                style={{ backgroundColor: selectedCategory?.id === cat.id ? "#e8def8" : "transparent" }}
              >
                {cat.name}
              </Chip>
            ))}
         </View>

         <TextInput
          label="Establishment / Location"
          value={establishment}
          onChangeText={setEstablishment}
          mode="outlined"
          placeholder="e.g., Jollibee, SM Mall"
          style={{ marginBottom: 16 }}
        />

        <Text variant="labelLarge" style={{ marginBottom: 8 }}>Payment Source</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {["cash", "card", "bank", "e_wallet"].map((t) => {
            const isSelected = selectedMethodType.toLowerCase() === t.toLowerCase();
            return (
              <Chip
                key={t}
                selected={isSelected}
                onPress={() => {
                  setSelectedMethodType(t);
                  // Find the first default method for this type
                  const firstOfColor = availablePaymentMethods.find(m => m.type.toLowerCase() === t.toLowerCase());
                  if (firstOfColor) {
                    setPaymentMethod(firstOfColor.name);
                  } else if (t === "cash") {
                    setPaymentMethod("Cash");
                  }
                }}
                mode="outlined"
                style={{
                  backgroundColor: isSelected ? theme.colors.primaryContainer : "transparent",
                  borderColor: isSelected ? theme.colors.primary : theme.colors.outline
                }}
              >
                {t.replace("_", " ").toUpperCase()}
              </Chip>
            );
          })}
        </View>

        {selectedMethodType.toLowerCase() !== "cash" && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: theme.colors.primaryContainer }}>
            {availablePaymentMethods
              .filter(m => m.type.toLowerCase() === selectedMethodType.toLowerCase())
              .map((method) => {
                const isMethodSelected = paymentMethod.toLowerCase() === method.name.toLowerCase();
                return (
                  <Chip
                    key={method.id}
                    icon={method.icon}
                    selected={isMethodSelected}
                    onPress={() => setPaymentMethod(method.name)}
                    mode="flat"
                    selectedColor={theme.colors.primary}
                    style={{ backgroundColor: isMethodSelected ? theme.colors.primaryContainer : theme.colors.surfaceVariant }}
                  >
                    {method.name}
                  </Chip>
                );
              })}
          </View>
        )}

        <TextInput
          label="Note (Optional)"
          value={note}
          onChangeText={setNote}
          mode="outlined"
          multiline
          style={{ marginBottom: 16 }}
        />

        <Text variant="labelLarge" style={{ marginBottom: 8 }}>Receipt Image</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          <Button icon="camera" mode="outlined" onPress={takePhoto}>
            Take Photo
          </Button>
          <Button icon="image" mode="outlined" onPress={pickImage}>
            Gallery
          </Button>
        </View>

        {receiptImage && (
          <View style={{ position: "relative", marginBottom: 16 }}>
            <Image
              source={{ uri: receiptImage }}
              style={{ width: "100%", height: 200, borderRadius: 8 }}
              contentFit="cover"
            />
            <IconButton
              icon="close-circle"
              size={24}
              iconColor="red"
              style={{ position: "absolute", top: 0, right: 0 }}
              onPress={() => setReceiptImage(null)}
            />
          </View>
        )}

        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={loading}
          disabled={loading}
          style={{ marginTop: 8 }}
        >
          Save Transaction
        </Button>

        <View style={{ height: 40 }} />

        <Portal>
          <Modal
            visible={showCalendar}
            onDismiss={() => setShowCalendar(false)}
            contentContainerStyle={{
              backgroundColor: "transparent",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Card style={{ width: "90%", borderRadius: 24, padding: 16, elevation: 10 }}>
              <Text variant="titleMedium" style={{ marginBottom: 16, fontWeight: "700", textAlign: "center" }}>
                Select Transaction Date
              </Text>
              <Calendar
                current={date.toISOString().split('T')[0]}
                onDayPress={(day) => {
                  setDate(new Date(day.timestamp));
                  setShowCalendar(false);
                }}
                markedDates={{
                  [date.toISOString().split('T')[0]]: { selected: true, selectedColor: theme.colors.primary }
                }}
                theme={{
                  backgroundColor: theme.colors.surface,
                  calendarBackground: theme.colors.surface,
                  textSectionTitleColor: theme.colors.primary,
                  selectedDayBackgroundColor: theme.colors.primary,
                  selectedDayTextColor: '#ffffff',
                  todayTextColor: theme.colors.primary,
                  dayTextColor: theme.colors.onSurface,
                  textDisabledColor: theme.colors.surfaceVariant,
                  dotColor: theme.colors.primary,
                  selectedDotColor: '#ffffff',
                  arrowColor: theme.colors.primary,
                  disabledArrowColor: theme.colors.surfaceVariant,
                  monthTextColor: theme.colors.onSurface,
                  indicatorColor: theme.colors.primary,
                  textDayFontWeight: '300',
                  textMonthFontWeight: '700',
                  textDayHeaderFontWeight: '300',
                  textDayFontSize: 16,
                  textMonthFontSize: 18,
                  textDayHeaderFontSize: 14
                }}
              />
              <Button
                mode="text"
                onPress={() => setShowCalendar(false)}
                style={{ marginTop: 16 }}
              >
                Close
              </Button>
            </Card>
          </Modal>
        </Portal>
      </ScrollView>
    </View>
  );
}
