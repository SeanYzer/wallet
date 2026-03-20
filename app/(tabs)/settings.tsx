import { View, ScrollView } from "react-native";
import { Appbar, List, RadioButton, Text, Card, Switch, Divider, Button, Avatar, useTheme as usePaperTheme } from "react-native-paper";
import { useRouter } from "expo-router";
import { useCurrency, CURRENCIES, CurrencyCode } from "../../context/CurrencyContext";
import { useAppTheme } from "../../context/ThemeContext";
import { useUserProfile } from "../../context/UserProfileContext";
import { useLanguage } from "../../context/LanguageContext";
import { usePasscode } from "../../context/PasscodeContext";

export default function SettingsScreen() {
  const router = useRouter();
  const paperTheme = usePaperTheme();
  const { currency, setCurrency, decimalPlaces, setDecimalPlaces } = useCurrency();
  const { theme, isDarkMode, toggleTheme } = useAppTheme();
  const { profile } = useUserProfile();
  const { language, setLanguage, t } = useLanguage();
  const { isPasscodeEnabled, setIsPasscodeEnabled, setPasscode, setIsUnlocked } = usePasscode();

  const handleTogglePasscode = (enabled: boolean) => {
      if (enabled) {
          // In a real app, we'd show a modal to set the code
          setPasscode("1234"); 
          setIsPasscodeEnabled(true);
          setIsUnlocked(false);
      } else {
          setIsPasscodeEnabled(false);
          setPasscode(null);
      }
  };

  return (
    <View style={{ flex: 1, backgroundColor: paperTheme.colors.background }}>
      <Appbar.Header style={{ backgroundColor: paperTheme.colors.background, elevation: 0 }}>
        <Appbar.Content title={t("settings")} titleStyle={{ fontWeight: "700" }} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* User Profile Section */}
        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Avatar.Text 
                size={48} 
                label={profile?.name?.substring(0, 2).toUpperCase() || "US"} 
                style={{ backgroundColor: paperTheme.colors.primary }}
              />
              <View style={{ marginLeft: 16 }}>
                <Text variant="titleMedium">{profile?.name || "Wise User"}</Text>
                <Text variant="bodySmall" style={{ color: paperTheme.colors.outline }}>
                  Local Profile (Offline)
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* General Settings */}
        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 16 }}>{t("categories")}</Text>
            <List.Item
              title={t("categories")}
              description="Manage income & expense categories"
              left={props => <List.Icon {...props} icon="shape-outline" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push("/category-settings")}
            />
          </Card.Content>
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 16 }}>{t("appearance")}</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <List.Icon icon="theme-light-dark" color={paperTheme.colors.onSurfaceVariant} />
                <Text variant="bodyLarge" style={{ marginLeft: 12 }}>{t("darkMode")}</Text>
              </View>
              <Switch value={isDarkMode} onValueChange={toggleTheme} />
            </View>

            <Divider style={{ marginVertical: 8 }} />

            <Text variant="titleSmall" style={{ marginTop: 8 }}>{t("language")}</Text>
            <RadioButton.Group onValueChange={(v) => setLanguage(v as "en" | "tl")} value={language}>
              <RadioButton.Item label="English" value="en" />
              <RadioButton.Item label="Filipino" value="tl" />
            </RadioButton.Group>
          </Card.Content>
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 16 }}>{t("currency")}</Text>
            <RadioButton.Group onValueChange={(value) => setCurrency(value as CurrencyCode)} value={currency.code}>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {Object.values(CURRENCIES).map((curr) => (
                    <View key={curr.code} style={{ width: "50%" }}>
                        <RadioButton.Item
                        label={curr.code}
                        value={curr.code}
                        status={currency.code === curr.code ? 'checked' : 'unchecked'}
                        />
                    </View>
                ))}
              </View>
            </RadioButton.Group>

            <Divider style={{ marginVertical: 8 }} />
            
            <Text variant="titleSmall" style={{ marginTop: 8 }}>Decimal Points</Text>
            <RadioButton.Group onValueChange={(v) => setDecimalPlaces(parseInt(v))} value={decimalPlaces.toString()}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <RadioButton.Item label="0" value="0" />
                  <RadioButton.Item label="1" value="1" />
                  <RadioButton.Item label="2" value="2" />
              </View>
            </RadioButton.Group>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 16 }}>Security</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <List.Icon icon="lock-outline" color={paperTheme.colors.onSurfaceVariant} />
                <Text variant="bodyLarge" style={{ marginLeft: 12 }}>{t("passcode")} (1234)</Text>
              </View>
              <Switch value={isPasscodeEnabled} onValueChange={handleTogglePasscode} />
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
}
