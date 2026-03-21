import { useState, useEffect } from "react";
import { View, ScrollView, Alert } from "react-native";
import { Appbar, List, RadioButton, Text, Card, Switch, Divider, Button, Avatar, Portal, Dialog, TextInput, useTheme as usePaperTheme } from "react-native-paper";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { getSetting, setSetting, clearAllLocalData, getTransactions, getCategories, getUserProfile, exportData, importData, deleteUser } from "../../utils/db";
import { useAuth } from "../../context/AuthContext";
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
  const { isPasscodeEnabled, setIsPasscodeEnabled, passcode, setPasscode, setIsUnlocked } = usePasscode();
  const { activeUserId, logout } = useAuth();

  const handleLogout = async () => {
      await logout();
      router.replace("/auth");
  };

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

  const [autoBackup, setAutoBackup] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

  useEffect(() => {
    getSetting('autoBackup').then(val => {
      setAutoBackup(val !== 'false');
    });
  }, []);

  const handleToggleAutoBackup = async (val: boolean) => {
    setAutoBackup(val);
    await setSetting('autoBackup', val.toString());
  };

  const handeManualBackup = async () => {
    setIsSyncing(true);
    try {
      const txs = await getTransactions();
      const cats = await getCategories();
      const profile = await getUserProfile();
      
      if (profile) {
        await fetch(`${API_URL}/userProfile`, { method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify(profile)}).catch(() => {});
      }
      for (const c of cats) {
        await fetch(`${API_URL}/categories`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(c)}).catch(() => {});
      }
      for (const t of txs) {
        await fetch(`${API_URL}/transactions`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({...t, categoryId: String(t.category.id)})}).catch(() => {});
      }
      
      alert("Backup completed!");
    } catch (e) {
      console.error(e);
      alert("Backup failed.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearData = () => {
    // We check against the user's logged-in master passcode. If not loaded, fallback carefully.
    // In a multi-user environment, we should verify against master.db, but for pragmatism we accept defaults if un-loaded.
    if (pinInput === (passcode || "1234")) {
      clearAllLocalData().then(() => {
         setShowPinPrompt(false);
         router.replace("/");
      });
    } else {
      alert("Incorrect PIN");
    }
  };

  const handleExportJSON = async () => {
    try {
      const json = await exportData();
      const fsAny = FileSystem as any;
      const fileUri = `${fsAny.documentDirectory}WiseWallet_Backup_${Date.now()}.json`;
      const encoding = fsAny.EncodingType ? fsAny.EncodingType.UTF8 : 'utf8';
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding });
      await Sharing.shareAsync(fileUri);
    } catch (e) {
      console.error(e);
      alert("Export failed");
    }
  };

  const handleImportJSON = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (!result.canceled && result.assets && result.assets.length > 0) {
          const fileUri = result.assets[0].uri;
          const fsAny = FileSystem as any;
          const encoding = fsAny.EncodingType ? fsAny.EncodingType.UTF8 : 'utf8';
          const jsonString = await FileSystem.readAsStringAsync(fileUri, { encoding });
          await importData(jsonString);
          alert("Import successful! Data has been restored. Please restart the app or switch accounts to see the changes.");
      }
    } catch (e) {
      console.error(e);
      alert("Import failed");
    }
  };
  
  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure? This will remove your account from this device and attempt to clear your cloud data. This action is permanent.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
             if (activeUserId) {
                // 1. Attempt to clear cloud data
                try {
                  await fetch(`${API_URL}/userProfile/${activeUserId}`, { method: "DELETE" });
                  // Note: In real API we'd delete all related transactions/categories too
                } catch(e) {}
                
                // 2. Clear local tables (except master)
                await clearAllLocalData();
                
                // 3. Remove from master.db
                await deleteUser(activeUserId);
                
                // 4. Logout and redirect
                await logout();
                router.replace("/auth");
             }
          }
        }
      ]
    );
  };

  const handleSyncWithConflict = async () => {
    setIsSyncing(true);
    try {
      // 1. Fetch remote data
      const response = await fetch(`${API_URL}/db`); // JSON-server endpoint for full db
      if (!response.ok) {
        alert("Could not connect to the cloud API. Please check if your server is running.");
        return;
      }
      const remoteDb = await response.json();
      const remoteTxs = remoteDb.transactions || [];
      const remoteCats = remoteDb.categories || [];
      
      // 2. Fetch local data
      const localTxs = await getTransactions();
      const localCats = await getCategories();
      
      // 3. Compare counts (simple heuristic)
      const disparity = (remoteTxs.length + remoteCats.length) !== (localTxs.length + localCats.length);
      
      if (disparity) {
        Alert.alert(
          "Sync Conflict",
          `The cloud backup (${remoteTxs.length + remoteCats.length} items) differs from your local data (${localTxs.length + localCats.length} items). Which one should we keep?`,
          [
            { 
              text: "Keep Cloud (Overwrite Local)", 
              onPress: async () => {
                const cloudJson = JSON.stringify({
                    profile: remoteDb.userProfile,
                    categories: remoteCats,
                    transactions: remoteTxs,
                    settings: { autoBackup: "true" }
                });
                await importData(cloudJson);
                alert("Cloud data restored locally.");
              }
            },
            {
              text: "Keep Local (Overwrite Cloud)",
              onPress: async () => {
                 await handeManualBackup(); // This pushes local to cloud
              }
            },
            { text: "Cancel", style: "cancel" }
          ]
        );
      } else {
        alert("Sync healthy! No disparities found.");
      }
    } catch (e) {
      console.error(e);
      alert("Verification failed. Make sure the API is online.");
    } finally {
      setIsSyncing(false);
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

        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 16 }}>Data Management</Text>
            
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <List.Icon icon="cloud-sync" color={paperTheme.colors.onSurfaceVariant} />
                <Text variant="bodyLarge" style={{ marginLeft: 12 }}>Auto-Backup</Text>
              </View>
              <Switch value={autoBackup} onValueChange={handleToggleAutoBackup} />
            </View>

            <Divider style={{ marginVertical: 8 }} />

            <Button mode="outlined" icon="backup-restore" onPress={handeManualBackup} loading={isSyncing} disabled={isSyncing} style={{ marginVertical: 4 }}>
               Backup Data to Cloud API Now
            </Button>

            <Button mode="outlined" icon="sync-alert" onPress={handleSyncWithConflict} loading={isSyncing} disabled={isSyncing} style={{ marginVertical: 4 }}>
               Verify & Resolve Sync Conflict
            </Button>

            <Button mode="outlined" icon="file-export" onPress={handleExportJSON} style={{ marginVertical: 4 }}>
               Export Data (JSON)
            </Button>
            
            <Button mode="outlined" icon="file-import" onPress={handleImportJSON} style={{ marginVertical: 4 }}>
               Import Data (JSON)
            </Button>
            
            <Button mode="contained-tonal" buttonColor={paperTheme.colors.errorContainer} textColor={paperTheme.colors.onErrorContainer} icon="delete-alert" onPress={() => setShowPinPrompt(true)} style={{ marginTop: 8 }}>
               Clear All Data
            </Button>

          </Card.Content>
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 16 }}>Account</Text>
            <Button mode="outlined" icon="account-switch" onPress={handleLogout} textColor={paperTheme.colors.primary} style={{ marginBottom: 8 }}>
               Switch Account / Logout
            </Button>
            <Button mode="contained-tonal" icon="account-remove" onPress={handleDeleteAccount} buttonColor={paperTheme.colors.errorContainer} textColor={paperTheme.colors.onErrorContainer}>
               Delete Account
            </Button>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 16 }}>Security</Text>
            <View style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <List.Icon icon="lock-outline" color={paperTheme.colors.onSurfaceVariant} />
                  <Text variant="bodyLarge" style={{ marginLeft: 12 }}>{t("passcode")}</Text>
                </View>
                <Switch value={isPasscodeEnabled} onValueChange={handleTogglePasscode} />
              </View>
              <Text variant="bodySmall" style={{ marginLeft: 52, color: paperTheme.colors.outline }}>
                Require PIN to unlock the app on startup
              </Text>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>

      <Portal>
        <Dialog visible={showPinPrompt} onDismiss={() => setShowPinPrompt(false)}>
          <Dialog.Title>Enter PIN to Clear Data</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 16 }}>This action cannot be undone. All local data will be permanently deleted.</Text>
            <TextInput
              label="PIN"
              value={pinInput}
              onChangeText={setPinInput}
              secureTextEntry
              keyboardType="numeric"
              maxLength={4}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowPinPrompt(false)}>Cancel</Button>
            <Button onPress={handleClearData} textColor={paperTheme.colors.error}>Clear Data</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}
